#!/usr/bin/env python3
"""Safe standard-library client for the Triton Board Agent API."""

from __future__ import annotations

import argparse
import ipaddress
import json
import mimetypes
import os
import re
import sys
import unicodedata
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import (
    HTTPRedirectHandler,
    Request,
    build_opener,
)

API_URL_ENV = "TRITON_BOARD_API_URL"
API_KEY_ENV = "TRITON_BOARD_API_KEY"
API_SUFFIX = "/api/agent/v1"
CANONICAL_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
CANONICAL_API_KEY = re.compile(
    r"^tb_live_([A-Za-z0-9_-]{8})_"
    r"([A-Za-z0-9_-]{42}[AEIMQUYcgkosw048])$"
)
HOST_LABEL = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
REQUEST_TIMEOUT_SECONDS = 30
ALLOWED_ATTACHMENT_TYPES = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

_last_retry_after: str | None = None


class ClientError(Exception):
    """A safe user-facing client error that contains no credentials."""


class NoRedirects(HTTPRedirectHandler):
    """Return redirects as responses; never forward Authorization."""

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


class MultipartBody:
    def __init__(self, data: bytes, content_type: str) -> None:
        self.data = data
        self.content_type = content_type


def _invalid_api_base() -> None:
    raise ClientError(
        f"{API_URL_ENV} must be an http(s) origin plus the full "
        f"{API_SUFFIX} base."
    )


def _valid_hostname(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        pass
    try:
        ascii_hostname = value.encode("idna").decode("ascii")
    except UnicodeError:
        return False
    if len(ascii_hostname) > 253:
        return False
    labels = ascii_hostname.removesuffix(".").split(".")
    return bool(labels) and all(HOST_LABEL.fullmatch(label) for label in labels)


def _required_environment() -> tuple[str, str]:
    base = os.environ.get(API_URL_ENV, "")
    key = os.environ.get(API_KEY_ENV, "")
    if not base:
        raise ClientError(f"{API_URL_ENV} is required.")
    if not key:
        raise ClientError(f"{API_KEY_ENV} is required.")

    if (
        _contains_control(base)
        or any(character.isspace() for character in base)
        or "\\" in base
        or "?" in base
        or "#" in base
    ):
        _invalid_api_base()
    try:
        parts = urlsplit(base)
        hostname = parts.hostname
        port = parts.port
    except (ValueError, UnicodeError):
        _invalid_api_base()
    clean_path = parts.path.rstrip("/")
    if (
        parts.scheme not in {"http", "https"}
        or not parts.netloc
        or hostname is None
        or not _valid_hostname(hostname)
        or (port is not None and not 1 <= port <= 65535)
        or parts.netloc.endswith(":")
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
        or clean_path != API_SUFFIX
    ):
        _invalid_api_base()
    key_match = CANONICAL_API_KEY.fullmatch(key)
    if key_match is None or key_match[1] != key_match[2][:8]:
        raise ClientError(
            f"{API_KEY_ENV} must be a canonical Triton Board API Key."
        )
    return f"{parts.scheme}://{parts.netloc}{clean_path}", key


def _contains_control(value: str) -> bool:
    return any(
        unicodedata.category(character) == "Cc"
        for character in value
    )


def _fully_unquote(value: str) -> str:
    current = value
    for _ in range(8):
        if re.search(r"%(?![0-9A-Fa-f]{2})", current):
            raise ClientError("path contains invalid percent encoding.")
        decoded = unquote(current)
        if decoded == current:
            return current
        current = decoded
    raise ClientError("path is encoded too many times.")


def _safe_url(base: str, path: str) -> str:
    if (
        not path
        or _contains_control(path)
        or any(character.isspace() for character in path)
        or "\\" in path
        or "#" in path
    ):
        raise ClientError("path must be a non-empty safe relative API path.")
    try:
        parts = urlsplit(path)
    except (ValueError, UnicodeError):
        raise ClientError(
            "path must be a non-empty safe relative API path."
        ) from None
    if (
        parts.scheme
        or parts.netloc
        or path.startswith("/")
        or parts.fragment
    ):
        raise ClientError("path must be relative to the configured API base.")

    decoded_query = _fully_unquote(parts.query)
    if (
        not parts.path
        or _contains_control(decoded_query)
    ):
        raise ClientError("path contains traversal or unsafe characters.")
    for segment in parts.path.split("/"):
        decoded_segment = _fully_unquote(segment)
        if (
            _contains_control(decoded_segment)
            or "/" in decoded_segment
            or "\\" in decoded_segment
            or decoded_segment in {".", ".."}
        ):
            raise ClientError("path contains traversal or unsafe characters.")
    return f"{base}/{path}"


def _json_object(value: str, label: str) -> dict[str, object]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as reason:
        raise ClientError(f"{label} must be valid JSON.") from reason
    if not isinstance(parsed, dict):
        raise ClientError(f"{label} must be a JSON object.")
    return parsed


def _canonical_uuid(value: str, label: str) -> str:
    if not CANONICAL_UUID.fullmatch(value):
        raise ClientError(f"{label} must be a canonical lowercase UUID.")
    return value


def _decode_response(raw: bytes) -> dict[str, object]:
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as reason:
        raise ClientError("API response was not a UTF-8 JSON object.") from reason
    if not isinstance(value, dict):
        raise ClientError("API response was not a JSON object.")
    return value


def _decode_error_response(raw: bytes, status: int) -> dict[str, object]:
    try:
        return _decode_response(raw)
    except ClientError:
        return {
            "error": {
                "code": "NON_JSON_RESPONSE",
                "message": "API returned a non-JSON HTTP error response.",
                "retryable": status == 429 or status >= 500,
            }
        }


def request(
    method: str,
    path: str,
    *,
    body: object | None = None,
    etag: str | None = None,
    idempotency_key: str | None = None,
) -> tuple[int, dict[str, object], str | None]:
    """Dispatch one allowed request and return status, JSON body, and ETag."""
    global _last_retry_after
    _last_retry_after = None
    if method not in {"GET", "PATCH", "POST"}:
        raise ClientError("unsupported request method.")
    base, api_key = _required_environment()
    url = _safe_url(base, path)

    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    data: bytes | None = None
    if isinstance(body, MultipartBody):
        data = body.data
        headers["Content-Type"] = body.content_type
    elif body is not None:
        data = json.dumps(
            body,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if etag is not None:
        headers["If-Match"] = etag
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key

    try:
        api_request = Request(url, data=data, headers=headers, method=method)
    except (ValueError, UnicodeError):
        raise ClientError("API request could not be constructed safely.") from None
    opener = build_opener(NoRedirects)
    try:
        with opener.open(api_request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = _decode_response(response.read())
            _last_retry_after = response.headers.get("Retry-After")
            return response.status, payload, response.headers.get("ETag")
    except HTTPError as reason:
        _last_retry_after = reason.headers.get("Retry-After")
        payload = _decode_error_response(reason.read(), reason.code)
        return reason.code, payload, reason.headers.get("ETag")
    except (URLError, OSError, ValueError, UnicodeError):
        raise ClientError(
            "API transport failed; request outcome is unknown."
        ) from None


def _multipart(file_path: str, caption: str) -> MultipartBody:
    path = Path(file_path)
    try:
        size = path.stat().st_size
    except OSError as reason:
        raise ClientError("attachment file could not be read.") from reason
    mime = ALLOWED_ATTACHMENT_TYPES.get(path.suffix.lower())
    if mime is None:
        guessed, _ = mimetypes.guess_type(path.name)
        raise ClientError(
            f"attachment type is unsupported ({guessed or 'unknown'})."
        )
    if size < 1 or size > MAX_ATTACHMENT_BYTES:
        raise ClientError("attachment must be between 1 byte and 10 MiB.")
    try:
        contents = path.read_bytes()
    except OSError as reason:
        raise ClientError("attachment file could not be read.") from reason
    if len(contents) < 1 or len(contents) > MAX_ATTACHMENT_BYTES:
        raise ClientError("attachment must be between 1 byte and 10 MiB.")

    boundary = f"triton-board-{uuid.uuid4().hex}"
    safe_name = "".join(
        "_"
        if character in {'"', "\\"} or _contains_control(character)
        else character
        for character in path.name
    )
    chunks = [
        f"--{boundary}\r\n".encode(),
        (
            'Content-Disposition: form-data; name="file"; '
            f'filename="{safe_name}"\r\n'
        ).encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        contents,
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="caption"\r\n\r\n',
        caption.encode("utf-8"),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return MultipartBody(
        b"".join(chunks),
        f"multipart/form-data; boundary={boundary}",
    )


def _request_id(payload: dict[str, object]) -> str | None:
    meta = payload.get("meta")
    if isinstance(meta, dict) and isinstance(meta.get("request_id"), str):
        return meta["request_id"]
    error = payload.get("error")
    if isinstance(error, dict) and isinstance(error.get("request_id"), str):
        return error["request_id"]
    return None


def _print_result(
    status: int,
    payload: dict[str, object],
    etag: str | None,
) -> None:
    print(f"status: {status}")
    request_id = _request_id(payload)
    if request_id is not None:
        print(f"request_id: {request_id}")
    if etag is not None:
        print(f"etag: {etag}")
    if _last_retry_after is not None:
        print(f"retry_after: {_last_retry_after}")
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Safely call the Triton Board Agent API. "
            f"Set {API_URL_ENV} to the full {API_SUFFIX} base."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("capabilities", help="Inspect identity, scopes, and limits.")

    get_parser = subparsers.add_parser("get", help="GET a relative API path.")
    get_parser.add_argument("path")

    patch_parser = subparsers.add_parser(
        "patch",
        help="PATCH a relative path with a strict changes envelope.",
    )
    patch_parser.add_argument("path")
    patch_parser.add_argument("--etag", required=True, help="Quoted ETag from GET.")
    patch_parser.add_argument("--changes-json", required=True)

    post_parser = subparsers.add_parser(
        "post",
        help="POST JSON or one Attachment multipart form.",
    )
    post_parser.add_argument("path")
    post_parser.add_argument("--idempotency-key")
    content = post_parser.add_mutually_exclusive_group(required=True)
    content.add_argument("--body-json")
    content.add_argument("--file")
    post_parser.add_argument("--caption", default="")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "capabilities":
            status, payload, etag = request("GET", "capabilities")
        elif args.command == "get":
            status, payload, etag = request("GET", args.path)
        elif args.command == "patch":
            if not re.fullmatch(r'"[^"\r\n]+"', args.etag):
                raise ClientError("--etag must be the exact quoted ETag from GET.")
            changes = _json_object(args.changes_json, "--changes-json")
            if not changes:
                raise ClientError("--changes-json cannot be empty.")
            status, payload, etag = request(
                "PATCH",
                args.path,
                body={"changes": changes},
                etag=args.etag,
            )
        else:
            base, _api_key = _required_environment()
            _safe_url(base, args.path)
            if args.file is not None:
                attachment_match = re.fullmatch(
                    r"experiments/([0-9a-f-]+)/attachments",
                    args.path,
                )
                if attachment_match is None:
                    raise ClientError(
                        "--file is only valid for an Experiment attachments path."
                    )
                _canonical_uuid(attachment_match.group(1), "Experiment id")
                body: object = _multipart(args.file, args.caption)
            else:
                if args.caption:
                    raise ClientError("--caption requires --file.")
                body = _json_object(args.body_json, "--body-json")
            key = args.idempotency_key
            if key is None:
                key = str(uuid.uuid4())
            else:
                key = _canonical_uuid(key, "--idempotency-key")
            print(f"idempotency_key: {key}", flush=True)
            status, payload, etag = request(
                "POST",
                args.path,
                body=body,
                idempotency_key=key,
            )
        _print_result(status, payload, etag)
        return 0 if 200 <= status < 300 else 1
    except ClientError as reason:
        print(f"error: {reason}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
