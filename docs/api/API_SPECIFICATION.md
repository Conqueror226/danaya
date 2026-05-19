# DANAYA — API Specification

**Project:** DANAYA — National Digital Health Platform of Burkina Faso
**Document:** API Specification, v0.1
**Status:** Initial draft, derived from SDD v1.1 + DDD v0.1
**Authors:** A. Kader / DANAYA Architecture Working Group
**Date:** 2026-05-17
**Related artifacts:** SRS v1.0, SDD v1.1, DDD v0.1
**Repository:** https://github.com/Conqueror226/danaya

> **Naming.** The canonical project name is **DANAYA** (Dioula: *trust, confidence*).

---

## 0. Document Control

| Version | Date       | Author | Change                                  |
|---------|------------|--------|-----------------------------------------|
| 0.1     | 2026-05-17 | Kader  | Initial draft aligned with SDD + DDD    |

This document defines DANAYA's external HTTP surface: internal REST + JSON APIs consumed by the Staff Portal, Patient PWA, MCH Passport, and inter-layer sync; and external **FHIR R4** + DHIS2 endpoints for partner integration. Endpoint additions or breaking changes require an ADR.

---

## 1. Purpose & Scope

### 1.1 Purpose
Define every HTTP endpoint exposed by DANAYA: paths, methods, request/response shapes, authentication, error semantics, idempotency, pagination, and versioning. The OpenAPI 3.1 artifacts generated from this document are the single source of truth for client/server contracts.

### 1.2 Scope
In scope: internal REST APIs (v1), FHIR R4 exchange endpoints, DHIS2 export endpoints, OpenAPI structure, deprecation policy.
Out of scope: GraphQL (deferred), WebSocket / SSE (deferred to telemed phase), client SDK design (downstream).

### 1.3 Surface map

| Surface          | Base path               | Format       | Consumer                          |
|------------------|-------------------------|--------------|-----------------------------------|
| Internal REST    | `/api/v1/...`           | JSON         | Staff Portal, Patient PWA, MCH Passport, mobile (future) |
| FHIR R4          | `/fhir/...`             | FHIR JSON    | Inter-facility, partner systems   |
| DHIS2 export     | `/integration/dhis2/...`| DHIS2 JSON   | National HMIS                     |
| Sync (inter-layer)| `/sync/v1/...`         | JSON + JWS   | Layer 2 → Layer 3 → Layer 4       |
| Health / metrics | `/healthz`, `/metrics`  | text / Prom  | Observability                     |

---

## 2. API Design Principles

Twelve principles, binding:

1. **Resource-oriented REST.** Nouns, not verbs. `POST /patients` not `POST /createPatient`.
2. **OpenAPI 3.1 contract-first.** Specs in `/api/openapi/`; servers and clients are generated.
3. **URL versioning.** All paths carry `/v1/`. Breaking changes go to `/v2/` with overlap (§21).
4. **Stateless.** No server-side session; JWT bearer in every request.
5. **JSON, UTF-8.** `application/json; charset=utf-8` request and response.
6. **UUIDv7 identifiers** in every payload (consistent with DDD §4).
7. **ISO 8601 / RFC 3339 UTC** for all timestamps (`2026-05-17T08:42:00Z`).
8. **Idempotency on state change.** Every POST / PUT / DELETE requires `Idempotency-Key` (§6).
9. **Cursor pagination** for collections; never offset-based (collections grow, indexes don't get faster on offset).
10. **Problem Details (RFC 7807)** for all error responses.
11. **Two payload shapes per resource**: a `*-Read` shape (server → client, with audit fields) and a `*-Write` shape (client → server, without server-controlled fields). Generated from the same source.
12. **FHIR at the boundary.** Internal endpoints serve the DANAYA-native model. FHIR R4 is exposed under `/fhir/` for partner exchange. Internal clients never depend on FHIR shapes; this keeps internal evolution decoupled from FHIR profile churn.

> **Analogy.** Internal REST is the kitchen; FHIR is the dining room. The kitchen serves food the way the chef wants to cook it; the dining room serves food the way standards require it to be presented. Don't make the kitchen pretend to be the dining room.

---

## 3. Authentication & Authorization Model

### 3.1 Identity provider
- **Keycloak** (self-hosted) as the OIDC IdP.
- Realms: one per environment (`danaya-prod`, `danaya-staging`).
- Clients: `staff-portal`, `patient-pwa`, `mch-passport`, `sync-agent`, `fhir-gateway`.

### 3.2 Token model

| Token       | Algorithm | TTL                   | Issued to                       |
|-------------|-----------|------------------------|---------------------------------|
| Access      | RS256     | 15 min (staff), 1 h (patient) | All clients                     |
| Refresh     | opaque    | 8 h (staff), 30 d (patient)   | Confidential clients only       |
| Sync token  | RS256     | 5 min, audience-scoped | Sync agents only                 |
| Service     | RS256     | 5 min, mTLS-bound      | Internal service-to-service     |

Required claims on access tokens:

```json
{
  "iss": "https://idp.danaya.bf/realms/danaya-prod",
  "sub": "<danaya_user_id>",
  "aud": ["staff-portal","internal-api"],
  "exp": 1747469520,
  "iat": 1747468620,
  "jti": "<unique-token-id>",
  "session_id": "<session-uuid>",
  "roles": ["midwife"],
  "facility_ids": ["<uuid>"],
  "scopes": ["patient:read","mch:write","referral:create"],
  "amr": ["pwd","mfa"]
}
```

### 3.3 RBAC + ABAC

- **RBAC** — roles from SDD §8.2 (`midwife`, `doctor`, `pharmacist`, etc.) map to coarse scopes.
- **ABAC** overlay enforces *(role, facility, patient-relationship)*. Examples:
  - A `midwife` at CSPS A reading `GET /patients/{id}` where the patient's last encounter facility is CSPS B → **denied** unless an active referral, transfer, or care relationship exists.
  - A `referral_coordinator` at CHR Dori can read a patient referred to that CHR for 90 days after the referral arrival.

### 3.4 Scopes (internal)

| Scope                       | Granted to                        | Permits                                  |
|-----------------------------|-----------------------------------|------------------------------------------|
| `patient:read`              | clinical, ops                     | Read patient demographics                |
| `patient:write`             | reception, clinical               | Create / update patients                 |
| `health_id:issue`           | reception, facility_admin         | Issue / re-issue Health IDs              |
| `health_id:revoke`          | facility_admin, regional_admin    | Revoke Health IDs                        |
| `mch:read` / `mch:write`    | midwife, doctor                   | MCH data                                 |
| `encounter:read` / `:write` | clinical                          | Encounters                               |
| `pharmacy:read` / `:write`  | pharmacist                        | Prescriptions, dispensations             |
| `lab:read` / `:write`       | lab_tech, clinical                | Lab orders, results                      |
| `referral:read` / `:write`  | clinical, referral_coordinator    | Referrals                                |
| `consent:read` / `:write`   | clinical, ops                     | Consents                                 |
| `audit:read`                | auditor only                      | Audit log queries                        |
| `sync:produce` / `:consume` | sync agents (service tokens)      | Outbox drain / inbox push                |
| `break_glass`               | clinical (emergency)              | Cross-facility read with mandatory reason|

### 3.5 SMART-on-FHIR scopes (external `/fhir/`)
Standard SMART v2 scopes:
- `system/Patient.r` — full-system Patient read (service-to-service).
- `user/Encounter.rs` — current-user-bounded read+search.
- `patient/Observation.r?category=vital-signs` — context-bounded.

### 3.6 mTLS between layers
All sync and FHIR exchange between Layers 2 ↔ 3 ↔ 4 uses mutual TLS. Sync tokens are audience-bound and only valid when presented over an mTLS channel terminating at the expected peer certificate.

### 3.7 Break-glass
- Endpoint: `POST /api/v1/auth/break-glass` with body `{ patient_id, reason, supervisor_attest? }`.
- Returns a 15-minute, single-patient-scoped access token.
- Always audited with `action='break_glass'`, includes the supplied reason.
- A weekly review report goes to `regional_admin`.

---

## 4. Common Request / Response Conventions

### 4.1 Headers

**Request**

| Header                  | Required             | Notes                                                       |
|-------------------------|----------------------|-------------------------------------------------------------|
| `Authorization`         | yes (most endpoints) | `Bearer <jwt>`                                              |
| `Idempotency-Key`       | yes on POST/PUT/DELETE | UUIDv7, unique per logical operation                       |
| `X-Correlation-ID`      | recommended          | UUIDv7; echoed in response and logs                         |
| `X-Facility-ID`         | yes for facility-scoped writes | UUID; must be in token's `facility_ids`             |
| `Accept-Language`       | recommended          | `fr`, `mos`, `dyu`, `ful`                                   |
| `If-Match`              | when updating        | ETag value for optimistic concurrency                       |
| `Content-Type`          | yes for body         | `application/json; charset=utf-8`                           |

**Response**

| Header                | Notes                                                       |
|-----------------------|-------------------------------------------------------------|
| `ETag`                | Strong, derived from `version + updated_at`                 |
| `X-Correlation-ID`    | Echo                                                         |
| `Sunset`              | RFC 8594, for deprecated endpoints                          |
| `Deprecation`         | RFC 9745                                                    |
| `Cache-Control`       | `no-store` for PHI; `private, max-age=60` for reference data|
| `Content-Language`    | Echoes negotiated language                                  |
| `RateLimit-*`         | RFC 9331; quota information                                 |

### 4.2 Payload shape

Resource-style payloads use a uniform envelope for single resources:

```json
{
  "data": { ...resource fields... },
  "meta": {
    "version": 3,
    "etag": "\"3-2026-05-17T08:42:00Z\"",
    "updated_at": "2026-05-17T08:42:00Z"
  }
}
```

Collections use a cursor envelope:

```json
{
  "data": [ { ... }, { ... } ],
  "page": {
    "next_cursor": "eyJpZCI6IjAxOTAtZjU...",
    "prev_cursor": null,
    "limit": 50
  },
  "meta": { "total_estimate": 1184 }
}
```

`total_estimate` is intentionally an estimate (Postgres `pg_class.reltuples`-style) — exact counts on PHI tables are expensive and rarely needed.

### 4.3 Pagination
- Query params: `limit` (default 50, max 200), `cursor`, `sort` (whitelisted fields, prefix `-` for desc).
- Cursors are opaque base64url-encoded JSON containing the keyset position; clients treat them as opaque tokens.

### 4.4 Filtering
- Reserved query params: `q` (free text), `since` (ISO 8601), `until`, `status`, `facility_id`.
- Resource-specific filters documented per endpoint.
- No SQL-passthrough query languages on the wire.

### 4.5 Localization
- `Accept-Language` negotiates response strings (labels, messages).
- Codes are returned alongside labels: `{ "code": "MAM", "label": "Modéré aigu malnutri" }`.

---

## 5. Error Format (RFC 7807)

Every error response is a Problem Details document, `Content-Type: application/problem+json`:

```json
{
  "type": "https://errors.danaya.bf/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "Field 'date_of_birth' must be in the past.",
  "instance": "/api/v1/patients",
  "correlation_id": "01902f53-...",
  "errors": [
    { "pointer": "/data/date_of_birth", "code": "future_date", "message": "must be in the past" },
    { "pointer": "/data/phone",         "code": "format",       "message": "invalid phone format" }
  ]
}
```

### 5.1 Standard error codes (subset)

| HTTP | Type slug              | When                                                    |
|------|------------------------|---------------------------------------------------------|
| 400  | `validation`           | Schema or business rule violation                       |
| 401  | `unauthenticated`      | Missing / invalid / expired token                       |
| 403  | `forbidden`            | Token valid but RBAC/ABAC denied                        |
| 404  | `not_found`            | Resource does not exist (or denied without disclosure)  |
| 409  | `conflict`             | Optimistic concurrency, duplicate Health ID, etc.       |
| 410  | `gone`                 | Resource voided / deleted                               |
| 412  | `precondition_failed`  | `If-Match` mismatch                                     |
| 422  | `business_rule`        | Schema OK, domain rule fails                            |
| 423  | `locked`               | Resource under MPI manual review                        |
| 429  | `rate_limited`         | Quota exceeded; `Retry-After` header set                |
| 451  | `consent_required`     | Patient consent missing or revoked                      |
| 500  | `internal`             | Server error (correlation_id is the user's anchor)      |
| 503  | `degraded`             | Sync backlog or peer-layer unreachable                  |

### 5.2 Error redaction
Error bodies never echo PHI, never expose stack traces, never echo full SQL. Internal detail goes to logs by `correlation_id`.

---

## 6. Idempotency Rules

### 6.1 Requirement
All `POST`, `PUT`, `DELETE` require an `Idempotency-Key` header (UUIDv7 recommended). `GET`, `HEAD`, `OPTIONS` do not.

### 6.2 Server behavior
- The server records `(idempotency_key, endpoint, request_hash, response_status, response_body)` for 24 hours.
- Replay of the same key with the same endpoint:
  - Identical `request_hash` → returns the cached response (same status, same body).
  - Different `request_hash` → returns `409 Conflict` with `type=idempotency_mismatch`.
- Keys are scoped per (endpoint, originating facility). A key reused across endpoints is treated as a new operation.

### 6.3 Offline retry
Sync agents and the staff portal generate the `Idempotency-Key` at the moment of the user action (client-side UUIDv7). Retries — same key. This is essential when a CSPS posts twice over a flaky link.

---

## 7. Patient Registry API

Base path: `/api/v1/patients`

### 7.1 Endpoints

| Method | Path                                  | Scope                | Purpose                              |
|--------|---------------------------------------|----------------------|--------------------------------------|
| POST   | `/api/v1/patients`                    | `patient:write`      | Register a new patient                |
| GET    | `/api/v1/patients/{id}`               | `patient:read` (ABAC)| Read one patient                      |
| PATCH  | `/api/v1/patients/{id}`               | `patient:write`      | Update demographics                   |
| DELETE | `/api/v1/patients/{id}`               | `facility_admin`     | Void (no hard delete)                 |
| GET    | `/api/v1/patients/search`             | `patient:read`       | Search (exact + fuzzy)                |
| POST   | `/api/v1/patients/{id}/merge`         | `regional_admin`     | Merge duplicate records (MPI)         |
| GET    | `/api/v1/patients/{id}/identifiers`   | `patient:read`       | List external IDs                     |
| POST   | `/api/v1/patients/{id}/identifiers`   | `patient:write`      | Add an identifier (CNIB, etc.)        |

### 7.2 `POST /api/v1/patients`

**Request**

```http
POST /api/v1/patients HTTP/1.1
Authorization: Bearer <jwt>
Idempotency-Key: 0190ff53-7a40-7c81-b3e2-1c4b21f9b9aa
X-Facility-ID: 0190ff44-...
Content-Type: application/json; charset=utf-8

{
  "data": {
    "given_names": "Aïssata",
    "family_name": "Ouédraogo",
    "sex_at_birth": "F",
    "date_of_birth": "1996-03-12",
    "dob_precision": "day",
    "place_of_birth": "Dori",
    "primary_language": "fr",
    "phone": "+22670123456",
    "address_text": "Secteur 3, Dori",
    "address_admin1": "Sahel",
    "address_admin2": "Séno",
    "address_admin3": "Dori",
    "household_id": null
  }
}
```

**Response — 201 Created**

```http
HTTP/1.1 201 Created
Location: /api/v1/patients/0190ff53-9bb2-7e0a-...
ETag: "1-2026-05-17T08:42:00Z"

{
  "data": {
    "id": "0190ff53-9bb2-7e0a-...",
    "display_name": "Aïssata Ouédraogo",
    "given_names": "Aïssata",
    "family_name": "Ouédraogo",
    "sex_at_birth": "F",
    "date_of_birth": "1996-03-12",
    "dob_precision": "day",
    "primary_language": "fr",
    "phone_masked": "+226 70 ** ** 56",
    "address_text": "Secteur 3, Dori",
    "household_id": null,
    "is_deceased": false,
    "origin_facility_id": "0190ff44-..."
  },
  "meta": {
    "version": 1,
    "etag": "\"1-2026-05-17T08:42:00Z\"",
    "updated_at": "2026-05-17T08:42:00Z"
  }
}
```

**Status codes**: 201, 400, 401, 403, 409 (duplicate suspected — body includes MPI candidates), 422.

### 7.3 `GET /api/v1/patients/search`

Query parameters:
- `q` — free text matched against `display_name` (trigram).
- `dob` — ISO date for filtering.
- `phone` — exact / HMAC-hashed lookup server-side.
- `health_id` — Health ID value.
- `cnib` — CNIB number (encrypted lookup).
- `limit`, `cursor`, `sort`.

Response is paginated. Search of CNIB / phone requires `patient:write` because hashed lookups are cheap to brute-force at scale; the audit log records the queried hash.

### 7.4 `POST /api/v1/patients/{id}/merge`

**Request**

```json
{
  "data": {
    "source_patient_id": "0190a4...",
    "target_patient_id": "0190b2...",
    "mpi_match_score": 0.94,
    "reviewer_id": "0190c1...",
    "review_notes": "Same person, two registrations after CNIB linkage."
  }
}
```

**Response — 200 OK** returns the **target** patient with `meta.merge_history` listing collapsed source IDs.

---

## 8. Health ID API

Base path: `/api/v1/health-ids`

### 8.1 Endpoints

| Method | Path                                          | Scope               | Purpose                                  |
|--------|-----------------------------------------------|---------------------|------------------------------------------|
| POST   | `/api/v1/health-ids`                          | `health_id:issue`   | Issue a Health ID for a patient          |
| GET    | `/api/v1/health-ids/{value}`                  | `patient:read`      | Resolve a Health ID                      |
| POST   | `/api/v1/health-ids/{value}/qr`               | `health_id:issue`   | Generate a new signed QR card             |
| POST   | `/api/v1/health-ids/{value}/revoke`           | `health_id:revoke`  | Revoke (lost, duplicate, deceased)       |
| POST   | `/api/v1/health-ids/verify`                   | `patient:read`      | Offline-style verify of a QR payload     |
| GET    | `/api/v1/health-ids/signing-keys`             | public (no PHI)     | Public keys for offline verification     |

### 8.2 `POST /api/v1/health-ids`

```json
{
  "data": {
    "patient_id": "0190ff53-9bb2-7e0a-...",
    "link_cnib": false
  }
}
```

Response includes the formatted Health ID value:

```json
{
  "data": {
    "id": "0190ff61-...",
    "value": "BF-2026-A3K9P2-7",
    "patient_id": "0190ff53-9bb2-7e0a-...",
    "issued_at": "2026-05-17T08:43:21Z",
    "status": "active"
  },
  "meta": { "version": 1, "etag": "..." }
}
```

### 8.3 `POST /api/v1/health-ids/{value}/qr`

Issues (or re-issues) a signed QR card. Response carries the QR payload + a PNG render link:

```json
{
  "data": {
    "qr_issuance_id": "0190ff62-...",
    "qr_payload": "BF1|BF-2026-A3K9P2-7|0190ff53-9bb2-7e0a-...|1747468920|kid:k-l2-2026q2",
    "signature": "MEUCIQDc8...",
    "algorithm": "Ed25519",
    "signing_key_id": "k-l2-2026q2",
    "expires_at": "2027-05-17T08:43:21Z",
    "png_url": "/api/v1/health-ids/0190ff61-.../qr.png"
  }
}
```

### 8.4 `POST /api/v1/health-ids/verify`

Designed to be callable **offline** from a verifier app. The server-hosted variant accepts the same payload and returns the same result; the client library packaged in the staff portal does the same verification locally against `/health-ids/signing-keys` cached on device.

**Request**

```json
{
  "qr_payload": "BF1|BF-2026-A3K9P2-7|0190ff53-...|1747468920|kid:k-l2-2026q2",
  "signature": "MEUCIQDc8..."
}
```

**Response — 200 OK**

```json
{
  "valid": true,
  "health_id": "BF-2026-A3K9P2-7",
  "patient_id": "0190ff53-...",
  "issued_at": "2026-05-17T08:43:21Z",
  "expires_at": "2027-05-17T08:43:21Z",
  "verified_key_id": "k-l2-2026q2"
}
```

### 8.5 `GET /api/v1/health-ids/signing-keys`

Returns the active + grace-period public keys. Cached by clients; refreshed daily when online.

```json
{
  "data": [
    {
      "key_id": "k-l2-2026q2",
      "algorithm": "Ed25519",
      "public_key_pem": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAxyz...\n-----END PUBLIC KEY-----",
      "layer": 2,
      "activated_at": "2026-04-01T00:00:00Z",
      "retired_at": null
    },
    { "key_id": "k-l2-2026q1", "...": "...", "retired_at": "2026-06-30T00:00:00Z" }
  ]
}
```

---

## 9. MCH API

Base path: `/api/v1/mch`

### 9.1 Endpoints

| Method | Path                                                            | Scope         | Purpose                          |
|--------|-----------------------------------------------------------------|---------------|----------------------------------|
| POST   | `/api/v1/mch/pregnancies`                                       | `mch:write`   | Open a pregnancy                  |
| GET    | `/api/v1/mch/pregnancies/{id}`                                  | `mch:read`    | Read                              |
| GET    | `/api/v1/mch/pregnancies?patient_id=...`                        | `mch:read`    | List per patient                  |
| PATCH  | `/api/v1/mch/pregnancies/{id}`                                  | `mch:write`   | Update risk flags, status         |
| POST   | `/api/v1/mch/pregnancies/{id}/anc-visits`                       | `mch:write`   | Record an ANC visit               |
| GET    | `/api/v1/mch/pregnancies/{id}/anc-visits`                       | `mch:read`    | List visits                       |
| POST   | `/api/v1/mch/deliveries`                                        | `mch:write`   | Record a delivery                 |
| POST   | `/api/v1/mch/deliveries/{id}/newborns`                          | `mch:write`   | Register newborn(s)               |
| POST   | `/api/v1/mch/vaccinations`                                      | `mch:write`   | Record vaccination                |
| GET    | `/api/v1/mch/vaccinations?patient_id=...`                       | `mch:read`    | Vaccination history               |
| POST   | `/api/v1/mch/growth-measurements`                               | `mch:write`   | Record growth measurement         |
| GET    | `/api/v1/mch/growth-measurements?patient_id=...`                | `mch:read`    | Growth timeline                   |

### 9.2 `POST /api/v1/mch/pregnancies/{pregnancy_id}/anc-visits`

```json
{
  "data": {
    "visit_number": 2,
    "visit_date": "2026-05-17",
    "gestational_age_weeks": 18,
    "weight_kg": 62.4,
    "bp_systolic": 118,
    "bp_diastolic": 76,
    "fundal_height_cm": 17.5,
    "fetal_heart_rate": 142,
    "hb_g_dl": 11.8,
    "danger_signs": [],
    "interventions": ["iron_folate_supplement","ttv_dose_2"],
    "notes": "RAS"
  }
}
```

ANC visits are **append-only**. Corrections post a new visit with `supersedes_id` set; the old row stays for the audit log.

---

## 10. Digital MCH Passport API

Base path: `/api/v1/mch-passport`

| Method | Path                                                       | Scope                | Purpose                                  |
|--------|------------------------------------------------------------|----------------------|------------------------------------------|
| GET    | `/api/v1/mch-passport/{patient_id}/snapshot`              | `mch:read` (subject) | Latest snapshot for patient (auth as patient or proxy) |
| POST   | `/api/v1/mch-passport/{patient_id}/snapshot`              | `mch:write`          | Generate a new signed snapshot           |
| POST   | `/api/v1/mch-passport/{patient_id}/snapshot/{id}/revoke`  | `mch:write`          | Revoke a snapshot                        |
| POST   | `/api/v1/mch-passport/{patient_id}/proxy-grants`          | `consent:write`      | Grant family member access               |
| GET    | `/api/v1/mch-passport/verify`                             | public               | Verify a signed snapshot payload offline |

Snapshot bodies mirror the MCH Passport view: pregnancy timeline (current + recent), ANC visits, vaccinations, growth chart points, danger-sign reminders, scheduled visits. Signed Ed25519 with a `health_id.signing_keys` key.

---

## 11. Encounter API

Base path: `/api/v1/encounters`

| Method | Path                                            | Scope               | Purpose                       |
|--------|-------------------------------------------------|---------------------|-------------------------------|
| POST   | `/api/v1/encounters`                            | `encounter:write`   | Open an encounter              |
| GET    | `/api/v1/encounters/{id}`                       | `encounter:read`    | Read                           |
| PATCH  | `/api/v1/encounters/{id}`                       | `encounter:write`   | Update header (close, etc.)   |
| POST   | `/api/v1/encounters/{id}/vitals`                | `encounter:write`   | Record vitals (append-only)    |
| GET    | `/api/v1/encounters/{id}/vitals`                | `encounter:read`    | List vitals                    |
| POST   | `/api/v1/encounters/{id}/diagnoses`             | `encounter:write`   | Add diagnosis                  |
| GET    | `/api/v1/encounters/{id}/diagnoses`             | `encounter:read`    | List diagnoses                 |
| GET    | `/api/v1/patients/{patient_id}/timeline`        | `encounter:read`    | Merged clinical timeline       |

---

## 12. Pharmacy API

Base path: `/api/v1/pharmacy`

| Method | Path                                                | Scope               | Purpose                              |
|--------|-----------------------------------------------------|---------------------|--------------------------------------|
| POST   | `/api/v1/pharmacy/prescriptions`                    | `pharmacy:write` (prescriber) | Create prescription                  |
| GET    | `/api/v1/pharmacy/prescriptions/{id}`               | `pharmacy:read`     | Read                                  |
| POST   | `/api/v1/pharmacy/prescriptions/{id}/cancel`        | `pharmacy:write`    | Cancel                                |
| GET    | `/api/v1/pharmacy/prescriptions?patient_id=...&status=active` | `pharmacy:read` | Active rx list                       |
| POST   | `/api/v1/pharmacy/dispensations`                    | `pharmacy:write`    | Dispense (with allergy / duplicate checks) |
| POST   | `/api/v1/pharmacy/stock/movements`                  | `pharmacy:write`    | Stock movement (PN-counter)          |
| GET    | `/api/v1/pharmacy/stock/levels?facility_id=...`     | `pharmacy:read`     | Current stock (materialized view)     |
| GET    | `/api/v1/pharmacy/allergies?patient_id=...`         | `pharmacy:read`     | Patient allergies                    |
| POST   | `/api/v1/pharmacy/allergies`                        | `pharmacy:write`    | Record allergy                       |

Dispensation requests return `422 business_rule` with `code=allergy_conflict` or `code=duplicate_drug` unless the request includes the corresponding `*_override: true` + non-empty `*_override_reason`.

---

## 13. Laboratory API

Base path: `/api/v1/lab`

| Method | Path                                          | Scope          | Purpose                       |
|--------|-----------------------------------------------|----------------|-------------------------------|
| POST   | `/api/v1/lab/orders`                          | `lab:write`    | Create order                   |
| GET    | `/api/v1/lab/orders?status=pending`           | `lab:read`     | Order queue                    |
| POST   | `/api/v1/lab/orders/{id}/specimens`           | `lab:write`    | Specimen accession             |
| POST   | `/api/v1/lab/orders/{id}/items/{item_id}/results` | `lab:write` | Result entry (append-only)     |
| POST   | `/api/v1/lab/results/{id}/validate`           | `lab:write`    | Validate (chief / supervisor)  |
| GET    | `/api/v1/lab/results?patient_id=...`          | `lab:read`     | Results for patient            |
| GET    | `/api/v1/lab/results/{id}`                    | `lab:read`     | Single result                  |

Abnormal results emit `lab.result.abnormal` to the event bus; Notification module pages the ordering clinician.

---

## 14. Referral API

Base path: `/api/v1/referrals`

| Method | Path                                            | Scope                 | Purpose                                                |
|--------|-------------------------------------------------|-----------------------|--------------------------------------------------------|
| POST   | `/api/v1/referrals`                             | `referral:write`      | Create referral; server builds the FHIR Bundle         |
| GET    | `/api/v1/referrals/{id}`                        | `referral:read`       | Read                                                    |
| GET    | `/api/v1/referrals?destination_facility_id=...&status=...` | `referral:read` | Inbox / outbox views                                   |
| POST   | `/api/v1/referrals/{id}/acknowledge`            | `referral:write`      | Receiving facility acknowledges arrival                |
| POST   | `/api/v1/referrals/{id}/complete`               | `referral:write`      | Close the loop                                          |
| POST   | `/api/v1/referrals/{id}/cancel`                 | `referral:write`      | Cancel with reason                                      |
| GET    | `/api/v1/referrals/{id}/bundle`                 | `referral:read`       | The signed FHIR Bundle (for offline envelope)          |
| GET    | `/api/v1/referrals/{id}/status-events`          | `referral:read`       | Full state history                                      |

`POST /api/v1/referrals` builds the FHIR Bundle server-side and writes it to `referral.referral_bundles`. The Sync Engine picks it up and pushes to the destination via `/fhir/Bundle$transaction` (§18).

---

## 15. Consent API

Base path: `/api/v1/consents`

| Method | Path                                          | Scope               | Purpose                              |
|--------|-----------------------------------------------|---------------------|--------------------------------------|
| POST   | `/api/v1/consents`                            | `consent:write`     | Record a consent (grant or deny)     |
| GET    | `/api/v1/consents?patient_id=...&type=...`    | `consent:read`      | List consents for patient            |
| GET    | `/api/v1/consents/{id}`                       | `consent:read`      | Read                                  |
| POST   | `/api/v1/consents/{id}/revoke`                | `consent:write`     | Revoke an active consent             |

**Request**

```json
{
  "data": {
    "patient_id": "0190ff53-...",
    "consent_type": "data_share_facility",
    "scope": {
      "facilities": ["CHR_DORI_FACILITY_ID"],
      "data_classes": ["mch","encounter","lab"],
      "purpose": "referral_care"
    },
    "granted": true,
    "granted_by_role": "patient",
    "expires_at": "2027-05-17T08:42:00Z",
    "signature_method": "thumbprint_image",
    "signature_payload_base64": "iVBORw0KGgo..."
  }
}
```

`451 consent_required` is returned by other endpoints when the relevant `Consent` is missing/revoked; the body indicates the consent type expected.

---

## 16. Audit API

Base path: `/api/v1/audit`

| Method | Path                                                | Scope          | Purpose                              |
|--------|-----------------------------------------------------|----------------|--------------------------------------|
| GET    | `/api/v1/audit/patient/{patient_id}`                | `audit:read`   | Audit entries for a patient          |
| GET    | `/api/v1/audit/actor/{actor_id}`                    | `audit:read`   | Audit entries for an actor           |
| GET    | `/api/v1/audit?since=...&until=...&action=...`      | `audit:read`   | Filtered query                       |
| GET    | `/api/v1/audit/chain/verify?facility_id=...&period=...` | `audit:read` | Verify hash chain checkpoint signature|
| GET    | `/api/v1/audit/export?facility_id=...&period=...`   | `auditor`      | Signed export for inspection          |

The audit API is **read-only on the wire**. Writes happen via the internal audit hook, never via HTTP from external clients.

---

## 17. Sync API

Base path: `/sync/v1`. **mTLS required.** Service tokens only.

| Method | Path                                  | Scope           | Purpose                                                       |
|--------|---------------------------------------|-----------------|---------------------------------------------------------------|
| POST   | `/sync/v1/outbox/drain`               | `sync:produce`  | Lower-layer drains its outbox to upper layer (push)          |
| POST   | `/sync/v1/inbox`                      | `sync:consume`  | Upper layer receives a batch from lower layer                |
| GET    | `/sync/v1/status`                     | `sync:produce`  | Sync status / lag                                             |
| POST   | `/sync/v1/inbox/replay`               | `sync:consume`  | Replay an inbox window (operational tool)                     |
| GET    | `/sync/v1/conflicts?status=requires_review` | `sync:consume` | List manual-review items                                  |

### 17.1 `POST /sync/v1/outbox/drain`

Sender → receiver. The sender posts a batch of events from its outbox; each event has its own `Idempotency-Key` and is signed.

**Request**

```http
POST /sync/v1/outbox/drain HTTP/1.1
Authorization: Bearer <sync-jwt>
Content-Type: application/json; charset=utf-8

{
  "facility_id": "0190ff44-...",
  "schema_version": { "patient_registry": 14, "mch": 9, "health_id": 5 },
  "batch": [
    {
      "event_id": "0190ff90-...",
      "event_type": "patient.created",
      "aggregate_type": "patient_registry.patients",
      "aggregate_id": "0190ff53-9bb2-7e0a-...",
      "payload": { "...": "..." },
      "hlc_ts": 17474688200001234,
      "signature": "MEUCIQDc8..."
    }
  ]
}
```

**Response — 200 OK**

```json
{
  "accepted": ["0190ff90-..."],
  "duplicates": [],
  "rejected": [
    { "event_id": "0190ff91-...", "reason": "schema_version_too_old", "min_version": 10 }
  ]
}
```

### 17.2 `POST /sync/v1/inbox`

Upper layer pushing back to a lower layer (e.g., MPI canonicalization decisions, national catalog updates). Same shape, opposite direction.

### 17.3 `GET /sync/v1/status`

```json
{
  "facility_id": "0190ff44-...",
  "peer_layer": 3,
  "last_outbound_at": "2026-05-17T08:42:00Z",
  "last_inbound_at": "2026-05-17T08:41:55Z",
  "outbound_pending": 14,
  "inbound_pending": 0,
  "outbound_lag_seconds": 5,
  "health": "green"
}
```

---

## 18. FHIR Exchange Endpoints

Base path: `/fhir`. SMART-on-FHIR scopes required.

| Method | Path                                | Purpose                                                       |
|--------|-------------------------------------|---------------------------------------------------------------|
| POST   | `/fhir/Bundle$transaction`          | Atomic submission of a referral or transfer bundle           |
| GET    | `/fhir/Patient/{id}`                | Read Patient resource (DANAYA-BF profile)                    |
| GET    | `/fhir/Patient?identifier=...`      | Search by Health ID system or CNIB system                    |
| GET    | `/fhir/Encounter/{id}`              | Read Encounter                                                |
| GET    | `/fhir/Encounter?patient=...`       | Search encounters by patient                                  |
| GET    | `/fhir/Observation?patient=...&category=vital-signs` | Search observations                          |
| GET    | `/fhir/MedicationRequest?patient=...` | Active medications                                          |
| GET    | `/fhir/Immunization?patient=...`    | Vaccination history                                           |
| GET    | `/fhir/Consent?patient=...`         | Consent resources                                             |
| GET    | `/fhir/metadata`                    | CapabilityStatement, DANAYA-BF IG version                    |

### 18.1 Bundle transaction example (referral arrival at CHR Dori)

```http
POST /fhir/Bundle$transaction HTTP/1.1
Authorization: Bearer <sync-jwt>
Content-Type: application/fhir+json

{
  "resourceType": "Bundle",
  "id": "0190ff9a-...",
  "type": "transaction",
  "meta": { "profile": ["https://fhir.danaya.bf/StructureDefinition/danaya-referral-bundle"] },
  "entry": [
    { "request": { "method": "PUT", "url": "Patient/0190ff53-..." },
      "resource": { "resourceType": "Patient", "...": "..." } },
    { "request": { "method": "POST", "url": "Encounter" },
      "resource": { "resourceType": "Encounter", "...": "..." } },
    { "request": { "method": "POST", "url": "ServiceRequest" },
      "resource": { "resourceType": "ServiceRequest", "intent": "order", "...": "..." } }
  ]
}
```

Response is a FHIR `Bundle` of type `transaction-response`. Validation failures return a FHIR `OperationOutcome` resource (not Problem Details — FHIR convention).

### 18.2 Implementation Guide
The **DANAYA-BF Implementation Guide** (separate artifact under `/docs/fhir-ig/`) pins:
- Identifier systems: `http://danaya.bf/health-id`, `http://danaya.bf/cnib`.
- Required extensions: `danaya-pregnancy-risk-factors`, `danaya-vaccine-schedule-ref`.
- Slicing on `Patient.identifier` (Health ID required, CNIB optional).
- Required `meta.profile` on every resource crossing layer boundaries.

---

## 19. DHIS2 Export Endpoints

Base path: `/integration/dhis2`. Layer 4 only.

| Method | Path                                            | Purpose                                              |
|--------|-------------------------------------------------|------------------------------------------------------|
| POST   | `/integration/dhis2/export/run`                 | Trigger an ad-hoc export                              |
| GET    | `/integration/dhis2/export/jobs/{id}`           | Job status                                            |
| GET    | `/integration/dhis2/export/jobs?status=...`     | Job history                                           |
| POST   | `/integration/dhis2/configure`                  | Set the DHIS2 endpoint + data-element mapping        |

Scheduled jobs run nightly; payload is the DHIS2 `dataValueSets` JSON. Only aggregated, de-identified data leaves Layer 4.

---

## 20. OpenAPI Structure

### 20.1 Repository layout

```
/api
  /openapi
    /v1
      openapi.yaml                     # root
      paths/
        patients.yaml
        health-ids.yaml
        mch.yaml
        encounters.yaml
        pharmacy.yaml
        laboratory.yaml
        referrals.yaml
        consents.yaml
        audit.yaml
        sync.yaml
      components/
        schemas/
          Patient.yaml
          HealthId.yaml
          ANCVisit.yaml
          ...
        responses/
          Problem.yaml
          NotFound.yaml
          ...
        parameters/
          Pagination.yaml
          IdempotencyKey.yaml
        securitySchemes/
          BearerJwt.yaml
          mTLS.yaml
  /fhir
    /v1
      ig/
        StructureDefinition-danaya-patient.json
        StructureDefinition-danaya-referral-bundle.json
        CapabilityStatement-danaya-bf.json
        ImplementationGuide-danaya-bf.json
```

### 20.2 Generation
- Server: FastAPI generates a runtime OpenAPI document at `/api/v1/openapi.json` from Pydantic models; CI compares it to the canonical `/api/openapi/v1/openapi.yaml` and fails on drift.
- Clients: `openapi-generator` produces TypeScript axios clients for the Staff Portal and Patient PWA, regenerated on every API release.

### 20.3 Linting
- `spectral` ruleset enforces naming, examples-required, error-shape consistency. CI gate.

---

## 21. Versioning and Deprecation Policy

### 21.1 URL versioning
- Major versions: `/api/v1/`, `/api/v2/`. New major version when a breaking change is unavoidable.
- Minor / patch: backwards-compatible additions only; clients learn via `meta.api_version` and the OpenAPI document.

### 21.2 Backwards compatibility commitments
- Adding optional fields, endpoints, query params, enum values, response headers — *allowed* in a minor release.
- Removing fields, changing field types, narrowing accepted values, renaming endpoints — *not allowed*; require a new major version with overlap.

### 21.3 Deprecation flow
1. Mark deprecated in OpenAPI (`deprecated: true`) and serve `Deprecation: true` + `Sunset: <date>` headers.
2. Notify partners ≥ 12 months ahead of sunset.
3. After sunset, return `410 Gone` with a Problem pointing at the replacement.
4. Internal callers blocked from CI if they import deprecated paths.

### 21.4 Schema version negotiation in sync
Inter-layer sync carries `schema_version` per affected schema (DDD §19). Mismatches trigger compatibility-mode reads on the receiving side, not hard errors — a CSPS offline for two weeks does not get a 4xx, it gets graceful degradation while it catches up.

---

## 22. Phase-1 Endpoint Summary (build target)

The endpoints below are the minimum required for the Phase 1 spine. They are implementable from this spec + DDD v0.1 alone.

| # | Method | Path                                    | Module           | Notes                                          |
|---|--------|-----------------------------------------|------------------|------------------------------------------------|
| 1 | POST   | `/api/v1/patients`                      | Patient Registry | Create patient                                  |
| 2 | GET    | `/api/v1/patients/{id}`                 | Patient Registry | Read with ABAC                                  |
| 3 | GET    | `/api/v1/patients/search`               | Patient Registry | Trigram + HMAC lookups                         |
| 4 | POST   | `/api/v1/health-ids`                    | Health ID        | Issue Health ID                                 |
| 5 | GET    | `/api/v1/health-ids/{value}`            | Health ID        | Resolve a Health ID                            |
| 6 | POST   | `/api/v1/health-ids/{value}/qr`         | Health ID        | Generate signed QR card                         |
| 7 | POST   | `/api/v1/consents`                      | Consent          | Record a consent                                |
| 8 | GET    | `/api/v1/consents?patient_id=`          | Consent          | List consents                                   |
| 9 | GET    | `/api/v1/audit/patient/{patient_id}`    | Audit            | Patient audit trail                             |
|10 | POST   | `/sync/v1/outbox/drain`                 | Sync             | Inter-layer push (mTLS)                         |
|11 | POST   | `/sync/v1/inbox`                        | Sync             | Inter-layer receive (mTLS)                      |
|12 | GET    | `/sync/v1/status`                       | Sync             | Sync health                                     |

Sequenced delivery:
- Sprint 1: #1–3 (Patient Registry) + token plumbing.
- Sprint 2: #4–6 (Health ID + QR signing).
- Sprint 3: #7–8 (Consent) + #9 (Audit read).
- Sprint 4: #10–12 (Sync).

---

## 23. Cross-Cutting Operational Concerns

### 23.1 Rate limiting
- Per-token: 60 req/min for staff, 30 req/min for patient apps; burst 120.
- Per-IP backstop at the gateway.
- `429` returns `RateLimit-*` headers (RFC 9331) and `Retry-After`.

### 23.2 Security headers
All responses include:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: ...` (locked-down feature set)
- `Content-Security-Policy: default-src 'self'; ...` (for the HTML clients served by Nginx)

### 23.3 CORS
- Closed by default; allowed origins per environment (staff portal, patient PWA, MCH passport).
- Credentials never allowed on cross-origin; clients are same-origin in production.

### 23.4 OWASP API Top 10 mitigations (quick map)
| Risk                              | Mitigation                                                |
|-----------------------------------|-----------------------------------------------------------|
| BOLA (Broken Object Level Auth)   | ABAC on every read; tested via contract suite              |
| Broken Authentication             | OIDC + MFA, short token TTL, refresh rotation              |
| Excessive Data Exposure           | `*-Read` / `*-Write` shapes; phone masked unless scope     |
| Lack of Rate Limiting             | RFC 9331 limits per-token + per-IP                         |
| BOPLA / Mass Assignment           | Pydantic models enforce field allowlists                   |
| Security Misconfig                | Strict CSP, HSTS, locked CORS; tested in CI                |
| Improper Inventory Mgmt           | OpenAPI is single source; spec drift fails CI              |
| Unsafe API Consumption (partners) | FHIR Bundle signature verification; schema validation      |

### 23.5 Observability per request
- `X-Correlation-ID` propagated to logs and downstream calls.
- OpenTelemetry trace context (`traceparent`) honored if provided.
- Latency budget exposed as `Server-Timing` for debug builds.

---

## 24. Next Documents

1. **Security Architecture** — KMS choice, signing key lifecycle, audit chain verification protocol, token revocation strategy, threat model. Strongly recommended next (your thesis lane).
2. **Project Management Plan** — phase Gantt with API/DB/SDD milestones, RACI, governance.
3. **Test Plan** — unit / contract / integration / sync chaos / DR drill. Contract tests are this spec's executable form.
4. **Deployment Guide** — facility onboarding, schema bootstrap, key provisioning.
5. **DANAYA-BF FHIR Implementation Guide** — companion artifact published alongside `/api/openapi/v1/`.

---

## 25. Open Questions

1. Confirm the Health ID *format* (`BF-YYYY-NNNNNN-C`): is the checksum algorithm Mod-37, ISO 7064 Mod-11-2, or Luhn? *ADR-020.*
2. SMART-on-FHIR v1 vs v2 scope syntax — adopt v2 baseline? *ADR-021.*
3. CORS strategy if the Patient PWA is ever served from a CDN domain distinct from the API. *ADR-022.*
4. Rate-limit tuning per role; the 60/30/120 numbers above are placeholders pending load testing. *Test Plan.*
5. Authentication method for the public `POST /api/v1/health-ids/verify` endpoint — anonymous, captcha-gated, or restricted to issued verifier apps? *Security Architecture.*

---

*« Danaya ka kɛnɛya. » — An API is a promise about how two systems will talk. Keep it precise; the patient depends on it.*
