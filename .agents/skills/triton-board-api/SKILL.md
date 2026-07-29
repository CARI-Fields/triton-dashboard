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
   - For PATCH: GET current resource, retain its quoted ETag, compute the smallest allowed change, and PATCH with `If-Match`.
     For Attachment PATCH, GET the parent Experiment and locate the target Attachment in its response body. Treat that object as `attachment`; quote `attachment.updated_at` for `If-Match`, never the parent Experiment ETag. Stop if the target Attachment or its `updated_at` is unavailable.
   - For POST: use the exact known parent, relative endpoint path, and strict input with the endpoint-specific write scope; let the server check live Task collaboration, and POST once with one stable `Idempotency-Key`. POST does not require `board:read` or a preflight GET.
4. Verify the write response. A successful POST response is sufficient. Optional GET verification requires `board:read`.

Run `python3 scripts/triton_board_api.py --help` for client syntax. Prefer this client so the raw Key stays in the environment instead of shell arguments. Read [references/openapi.yaml](references/openapi.yaml) only when endpoint, scope, filter, field, or response details are needed.

## Safety and recovery

- Never print the raw Key or request headers.
- Never attempt DELETE or batch operations.
- Never send Owner, assignee, parent, or system fields. Send only an endpoint's documented request envelope.
- On `412`, GET the latest resource and compare the intended fields. Stop when the same target fields changed remotely; otherwise retry one minimal PATCH with the new ETag.
- On `401`, `403`, or `422`, diagnose the request and do not repeat it unchanged.
- On `409`, stop; do not repeat the conflicting POST or reuse its key for different request data.
- On `429`, obey `Retry-After`.
- On a POST transport or `5xx` outcome with unknown commit state, reuse the same `Idempotency-Key`; never generate a replacement for that logical request.
- On a PATCH transport failure, GET the resource before deciding whether another PATCH is necessary.
