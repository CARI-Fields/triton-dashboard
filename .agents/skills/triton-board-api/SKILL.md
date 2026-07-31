---
name: triton-board-api
description: Use when an AI agent needs to read Triton Board capabilities, board data, tasks, experiments, activity, attachments, or audit records; patch tasks, experiments, or attachment captions; or create experiments, activity comments, or experiment attachments through the Triton Board Agent API.
---

# Triton Board API

Use the bundled safe client:

1. Require `TRITON_BOARD_API_URL` and `TRITON_BOARD_API_KEY`. Set the URL to the full `/api/agent/v1` base.
2. Call `python3 scripts/triton_board_api.py capabilities`.
3. Follow the matching operation recipe:
   - For GET/read: use the exact relative endpoint path, documented filters, and required read scope; use the successful response as the result.
   - For Task or Experiment PATCH: GET current resource, retain its quoted ETag, compute the smallest allowed change, and PATCH with `If-Match`.
   - For Attachment PATCH: use a trusted current target `attachment.updated_at` supplied in context when available; quote it for `If-Match`, never the parent Experiment ETag. Do not GET when that trusted target version is available. Otherwise, only when the Attachment is Experiment-linked and `board:read` is available, GET the parent Experiment and select the target Attachment. Direct Task Attachments have no Agent GET, and Attachment PATCH does not require `board:read`; stop if no trusted current target `attachment.updated_at` is available.
   - For POST: use the exact known parent, relative endpoint path, and strict input with the endpoint-specific write scope; let the server check live Task collaboration, and POST once with one stable `Idempotency-Key`. POST does not require `board:read` or a preflight GET.
4. Verify the write response. A successful POST response is sufficient. Optional GET verification requires `board:read`.

Run `python3 scripts/triton_board_api.py --help` for client syntax. Prefer this client so the raw Key stays in the environment instead of shell arguments. Read [references/openapi.yaml](references/openapi.yaml) only when endpoint, scope, filter, field, or response details are needed.

## Template Experiments

Experiments created from a Template carry `template_id` and expose typed `values` (keyed by stable `key_id`) plus `archived_at` and the current `version_no`. Patch Values via `PATCH /experiments/{id}/values` with `expected_cell_revision`; 409 means the cell changed and the response includes `remote`. Archive is gated on Required Values. Restore is a new forward mutation on unarchived Experiments.

## Safety and recovery

- Never print the raw Key or request headers.
- Never attempt DELETE or batch operations.
- Never send Owner, assignee, parent, or system fields. Send only an endpoint's documented request envelope.
- On `412`, obtain a fresh trusted version through the matching PATCH version-source rule and compare the intended fields. Stop when the same target fields changed remotely or no trusted version is available; otherwise retry one minimal PATCH with the new ETag.
- On `401`, `403`, or `422`, diagnose the request and do not repeat it unchanged.
- On `409`, stop; do not repeat the conflicting POST or reuse its key for different request data.
- On `429`, obey `Retry-After`.
- On a POST transport or `5xx` outcome with unknown commit state, reuse the same `Idempotency-Key`; never generate a replacement for that logical request.
- On a PATCH transport failure, obtain a fresh trusted version through the matching PATCH version-source rule before deciding whether another PATCH is necessary; stop if that version is unavailable.
