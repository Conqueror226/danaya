# Pilot API contract

Base path: `/api` on the portal's origin. Payloads and responses are JSON. The server uses a cookie session; do not put account secrets or patient data in URLs. No public registration or anonymous patient access exists.

All writes require `Origin` equal to `APP_ORIGIN` and `X-Danaya-Request: 1`. Except for login, writes require an active session. Responses are `Cache-Control: no-store`. The gateway limits bodies to 64 KiB. No uploads are implemented.

| Method and route | Contract |
| --- | --- |
| GET `/health` | Anonymous database readiness; 200 or 503, no patient/account counts |
| POST `/auth/login` | `email`, `password`; sets session cookie; returns own user/facility and remaining session seconds |
| GET `/auth/me` | Own role/facility and remaining session lifetime |
| POST `/auth/extend` | Resets the current valid session to 30 minutes from now; returns `session_seconds`. 401 if expired |
| POST `/auth/logout` | Revokes the current session; 204 |
| GET `/facilities` | Registered destinations for signed-in users |
| GET `/patients` | `q`, `offset=0`, `limit=50`; items/total; facility-scoped and role-minimized |
| POST `/patients` | Identity/contact fields; facility derived from session; 201 |
| GET `/patients/{id}` | Authorized patient identity; foreign facility returns 404 |
| PUT `/patients/{id}` | Complete editable identity fields plus current `version`; 409 on conflict |
| GET `/records` | Optional `kind`, `status`, `patient_id`; `offset`, `limit`; items/total; includes authorized patient display name |
| POST `/records` | `patient_id`, `kind`, kind-specific `data`; 201 |
| PATCH `/records/{id}` | Current `version`, allowed next `status`, lab `result` when completing a test |
| GET `/transfers` | Paginated items/total where current facility is source or destination |
| POST `/transfers` | `patient_id`, `destination_id`, `summary`, `consent: true`, `consent_note`; 201 |
| PATCH `/transfers/{id}` | Current `version`; source doctor cancels, destination doctor accepts/declines |
| GET `/audit` | Admin-only paginated facility events; no clinical text |
| GET `/dashboard` | Counts of authorized pending record kinds and pending sent/received referrals |

List limits are capped at 100. `records` defaults to 100; other paginated lists default to 50. The portal uses pages of 50 for working lists. Audit entries refer to actor/resource IDs; they are not patient record exports.

## Record data

| Kind | Fields | Allowed transitions from pending |
| --- | --- | --- |
| appointment | `title`, timezone-aware future `scheduled_at`, `service` | completed / cancelled by doctor, nurse or admin |
| lab | `title`, optional `notes` | completed with `result` by laboratory; cancelled by doctor/nurse |
| prescription | `title`, explicit `instructions` | dispensed by pharmacist / cancelled by doctor |
| note | `title`, `notes` | Created as completed; no rewrite/delete transition |

Times are serialized with timezone information. IDs are opaque strings. A patient national ID is optional; a duplicate nonempty ID inside the same facility returns 409. Request bodies reject undeclared fields.

## Errors and retries

- 401: missing/expired/revoked session; clear displayed clinical data and sign in again.
- 403: role or origin denial; do not retry as a different role without authorization.
- 404: absent or inaccessible resource; deliberately does not expose another facility's record.
- 409: version/duplicate/finalized state conflict; refresh and reconcile.
- 422: invalid data or missing clinical workflow fields.
- 429: account or gateway login throttling; wait before retrying.
- 503: readiness failure.

Reads may be retried. Never blindly retry a write after an ambiguous network timeout: no generalized idempotency receipt is implemented. Version-checked transitions prevent a finalized action being applied twice, but creation requests without a unique national ID can duplicate. The UI distinguishes a confirmed save from a later refresh failure. Client-side role visibility is only usability; the API remains the security boundary.

Request-validation errors return a generic French message without echoing submitted password or patient values. Clients must treat interrupted writes, unexpected response formats and server/gateway failures as potentially committed; confirm the stored outcome before repeating a create request.
