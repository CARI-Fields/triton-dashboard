---
name: triton-board-api
description: Use when an AI agent needs to inspect, create, or update Triton Board tasks, experiments, attachments, activity, or audit records through the Triton Board Agent API.
---

# Triton Board API

Use the bundled safe client and the following sequence:

1. Require `TRITON_BOARD_API_URL` and `TRITON_BOARD_API_KEY`. Set the URL to the full `/api/agent/v1` base.
2. Call `python3 scripts/triton_board_api.py capabilities`.
3. GET current resource and retain its quoted ETag.
4. Compute the smallest allowed change.
5. PATCH with `If-Match`, or POST once with one stable `Idempotency-Key`.
6. Verify the response or GET again.

Run `python3 scripts/triton_board_api.py --help` for client syntax. Prefer this client so the raw Key stays in the environment instead of shell arguments. Read [references/openapi.yaml](references/openapi.yaml) only when endpoint, scope, filter, field, or response details are needed.

## Safety and recovery

- Never print the raw Key or request headers.
- Never attempt DELETE or batch operations.
- Never send Owner, assignee, parent, or system fields. Send only an endpoint's documented request envelope.
- On `412`, GET the latest resource and compare the intended fields. Stop when the same target fields changed remotely; otherwise retry one minimal PATCH with the new ETag.
- On `401`, `403`, or `422`, diagnose the request and do not repeat it unchanged.
- On `429`, obey `Retry-After`.
- On a POST transport failure, reuse the same `Idempotency-Key`; never generate a replacement for that logical request.
- On a PATCH transport failure, GET the resource before deciding whether another PATCH is necessary.
