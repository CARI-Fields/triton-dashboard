# Revoked API Key Deletion Design

Date: 2026-07-29

## Background

The Admin API Key page retains revoked credentials indefinitely. Administrators
need a way to remove records that were revoked before they were ever used,
without weakening the Agent API audit trail.

This is an Admin-only cleanup feature. It does not add DELETE support to the
Agent API, OpenAPI document, or Triton Board API Skill.

## Product Rules

An API Key record may be deleted only when all three conditions hold:

1. `revoked_at` is not null.
2. `last_used_at` is null (`Never used`).
3. No row in `agent_api_audit_log` references the Key.

The first two conditions are checked explicitly by the Admin service and again
in the conditional DELETE query. The existing audit foreign key remains the
authoritative protection for the third condition.

`last_used_at` is not treated as proof that no audit history exists. Usage
tracking is best-effort, so a Key with `last_used_at = null` may still be
referenced by an audit row. The UI therefore uses `last_used_at` as an early
eligibility hint, while the server and foreign key make the final decision.

## Admin API

The existing item route gains:

```text
DELETE /api/admin/v1/api-keys/:id
```

The handler uses the existing Admin authentication, request ID, no-store
response, and safe error serialization paths.

On success it returns HTTP 200 with the existing response envelope:

```json
{
  "data": {
    "id": "40000000-0000-4000-8000-000000000001"
  },
  "meta": {
    "request_id": "req_..."
  }
}
```

The service validates the UUID, loads the Key, and classifies ineligible rows
before deleting:

| Condition | Status | Code |
| --- | ---: | --- |
| Key does not exist | 404 | `API_KEY_NOT_FOUND` |
| Key is not revoked | 409 | `API_KEY_NOT_REVOKED` |
| `last_used_at` is not null | 409 | `API_KEY_WAS_USED` |
| Audit foreign key blocks deletion | 409 | `API_KEY_HAS_AUDIT_HISTORY` |

Unexpected Supabase or Postgres failures remain safe internal errors and do not
expose database messages, credentials, or query details.

## Service and Store Flow

`deleteManagedKey` is added beside the existing create, patch, rotate, and
revoke service functions.

The flow is:

1. Validate the Key UUID.
2. Load the current non-secret Key projection.
3. Return the appropriate 404 or 409 when it is missing, active, expired but
   not revoked, or previously used.
4. Ask the store to delete the row with all of these filters in the same
   statement:
   - matching `id`
   - `revoked_at is not null`
   - `last_used_at is null`
5. Return the deleted ID when one row was deleted.
6. Map Postgres foreign-key violation `23503` to
   `API_KEY_HAS_AUDIT_HISTORY`.
7. If the conditional delete affects no row, re-read the Key to classify a
   concurrent deletion or eligibility change without guessing.

The store exposes a narrow delete result rather than leaking raw Supabase
errors into the service. The delete response contains only the Key ID and
never includes `key_digest`.

The conditional statement is defense in depth against concurrent state
changes. The existing foreign key also protects an audit insertion that races
with deletion.

## Database Migration

The project uses imperative migrations. A new migration grants only:

```sql
grant delete on table public.api_keys to service_role;
```

The migration does not:

- grant DELETE to `anon` or `authenticated`;
- change the `agent_api_audit_log.api_key_id` foreign key;
- cascade or delete audit rows;
- add a database function, trigger, soft-delete column, or view.

The service-role key remains server-only. Browser code continues to use the
publishable Supabase key and calls the authenticated Admin route rather than
the Data API directly.

## Admin UI

Only revoked Key cards display a `Delete` action.

For a revoked Key whose `last_used_at` is not null:

- the Delete button remains visible but disabled;
- visible helper text says `Previously used keys cannot be deleted.`;
- the button references that helper through `aria-describedby`.

For a revoked Key whose `last_used_at` is null:

- the Delete button is enabled;
- clicking it asks:
  `Delete revoked API key “{name}”? This permanently removes the record and cannot be undone.`

After confirmation, the component uses the existing mutation guard and pending
state, sends the DELETE request, and disables conflicting Key operations. A
successful response removes that Key from local list state.

If audit history blocks the request, the card remains and the existing error
banner shows:

```text
API keys with audit history cannot be deleted.
```

The Admin list does not make an extra audit query. If a response is lost after
the server deletes the row, refreshing the list is the recovery path. There is
no special uncertain-delete state because no replacement secret or other
unrecoverable value is involved.

## Testing

### Service tests

- Reject an invalid ID.
- Return 404 for a missing Key.
- Return `API_KEY_NOT_REVOKED` for an active or expired-only Key.
- Return `API_KEY_WAS_USED` for a revoked Key with `last_used_at`.
- Delete a revoked, never-used Key and return only its ID.
- Convert an audit foreign-key conflict into
  `API_KEY_HAS_AUDIT_HISTORY`.
- Classify a zero-row conditional delete after a concurrent state change.

### Store tests

- Build a DELETE query filtered by ID, revoked state, and never-used state.
- Return the deleted ID without selecting secret fields.
- Distinguish no matching row, foreign-key conflict, and safe internal failure.

### Route tests

- Export DELETE on the item route while preserving PATCH.
- Authenticate the DELETE request as Admin.
- Await the dynamic ID and call the service.
- Return the no-store success envelope and safe error envelopes.

### Component tests

- Do not show Delete for non-revoked Keys.
- Show a disabled Delete button and visible reason for revoked, previously
  used Keys.
- Enable Delete for revoked, never-used Keys.
- Cancel confirmation without sending a request.
- Remove the card after a successful deletion.
- Preserve the card and show the audit-history message after a 409.
- Preserve existing duplicate-submission, session, unmount, and mutation
  guards.

### Database tests

- Confirm `service_role` has DELETE on `api_keys`.
- Confirm `anon` and `authenticated` do not.
- Confirm a referenced Key cannot be deleted and both the Key and audit row
  remain.
- Confirm an unreferenced revoked, never-used fixture can be deleted through
  the intended service-role path.

The final verification runs the focused tests, the full Vitest suite, database
migration/security tests, and the Next.js production build.

## Non-Goals

- Bulk deletion.
- Automatic retention or cleanup jobs.
- Deleting active, expired-only, or previously used Keys.
- Deleting, cascading, anonymizing, or rewriting audit history.
- Restoring a deleted Key.
- Adding DELETE to the Agent API or generated Skill.
- Adding an audit-history eligibility query to the Admin list.
