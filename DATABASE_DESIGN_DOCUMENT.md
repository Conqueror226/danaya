> Historical database proposal. The implemented schema is backend/platform/app/db.py and its Alembic migrations; see docs/ARCHITECTURE.md.

# DANAYA — Database Design Document (DDD)

**Project:** DANAYA — National Digital Health Platform of Burkina Faso
**Document:** Database Design Document, v0.1
**Status:** Initial draft, derived from SDD v1.1
**Authors:** A. Kader / DANAYA Architecture Working Group
**Date:** 2026-05-17
**Related artifacts:** SRS v1.0, SDD v1.1, Production Roadmap, Logical Data Model
**Repository:** https://github.com/Conqueror226/danaya

> **Naming.** The canonical project name is **DANAYA** (Dioula: *trust, confidence*).

---

## 0. Document Control

| Version | Date       | Author | Change                              |
|---------|------------|--------|-------------------------------------|
| 0.1     | 2026-05-17 | Kader  | Initial draft aligned with SDD v1.1 |

This DDD translates the SDD's logical modules into concrete PostgreSQL schemas, tables, indexes, and migration rules. It is binding on Phase 1 and advisory for Phase 2+. Schema deviations require an ADR in `/docs/adr/`.

---

## 1. Purpose & Scope

### 1.1 Purpose
Define the persistent data layer of DANAYA: schema layout, table structure, primary keys, foreign keys, indexes, partitioning, conflict handling, and migration policy. Every CREATE TABLE statement here is expected to materialize as a versioned migration under `/db/migrations/`.

### 1.2 Scope
In scope: schemas for the 16 modules in SDD §3.1, the cross-cutting audit + sync + consent stores, indexing and partitioning, retention, and migration policy.
Out of scope: query plans for analytics (→ Analytics design doc), DBA runbooks (→ Deployment Guide), threat-model details for key storage (→ Security Architecture).

### 1.3 Assumptions
- PostgreSQL 15 baseline at all layers (Layer 2/3/4). Upgrade path to 16/17 considered in §19.
- Extensions: `pgcrypto`, `pg_trgm`, `btree_gin`, `pg_uuidv7` (or equivalent function), `postgis` (for facility geo).
- One database cluster per facility at Layer 2; HA pair at Layer 3; warehouse + OLTP at Layer 4.

---

## 2. Database Design Principles

Ten principles, treated as binding:

1. **Schema per module.** Each SDD module owns exactly one PostgreSQL schema. No table is shared across modules.
2. **No cross-schema foreign keys.** Cross-module references are by ID only; referential integrity across modules is the application's responsibility (or enforced via domain events). This preserves the "extract to microservice" path.
3. **UUIDv7 primary keys everywhere.** Time-sortable, distributed-generation-safe (essential for offline-first), no central sequence dependence.
4. **Clinical data is append-only.** Vitals, encounters, lab results, dispensations, ANC visits — no UPDATE, no DELETE. Corrections produce a new row referencing the original via `supersedes_id`.
5. **Operational data may be mutable.** Workflow state (referral.status, prescription.status) updates in place; state transitions are constrained by CHECK or trigger.
6. **Hybrid Logical Clock on every row.** Column `hlc_ts BIGINT NOT NULL` accompanies `created_at`; HLC governs ordering during offline reconciliation (SDD §7.5).
7. **Audit columns mandatory.** Every table has `created_at`, `updated_at`, `created_by`, `updated_by`, `version`. Enforced by linter on migrations.
8. **Soft delete only for non-clinical.** `deleted_at TIMESTAMPTZ` for ops tables. Clinical never deletes; uses `voided_at` + `void_reason` tombstone pattern.
9. **Encryption at the column level for direct identifiers.** `national_id`, `phone`, `cnib_number` are stored encrypted via `pgcrypto` with keys rotated quarterly; searchable via deterministic hashed-index columns.
10. **Time-series tables are partitioned monthly.** Audit log, vitals, lab results, sync events, encounters.

> **Analogy.** The schema-per-module rule is like apartment doors: every module is its own apartment with its own lock. Visitors (cross-module reads) ring the doorbell (call the API). Nobody walks through walls (SQL joins across schemas). When an apartment becomes a separate building (microservice extraction), no walls need rebuilding.

### 2.1 Naming conventions

| Object              | Convention                                        | Example                       |
|---------------------|---------------------------------------------------|-------------------------------|
| Schema              | snake_case, singular module name                  | `patient_registry`            |
| Table               | snake_case, plural                                | `patients`, `anc_visits`      |
| Column              | snake_case, singular                              | `patient_id`, `recorded_at`   |
| PK column           | `id`                                              | `id UUID PRIMARY KEY`         |
| FK column           | `<referenced_table_singular>_id`                  | `patient_id`, `facility_id`   |
| Index               | `ix_<table>_<columns>`                            | `ix_patients_health_id`       |
| Unique index        | `uq_<table>_<columns>`                            | `uq_health_ids_value`         |
| Constraint          | `ck_<table>_<rule>`                               | `ck_anc_visits_gestational_age`|
| Trigger             | `tg_<table>_<event>`                              | `tg_audit_log_immutable`      |
| Timestamp columns   | `<verb>_at` (recorded_at, created_at, voided_at)  | `dispensed_at`                |
| Boolean columns     | `is_<adjective>` or `has_<noun>`                  | `is_active`, `has_consent`    |

---

## 3. Schema-per-Module Structure

Fourteen schemas mapped 1:1 to SDD modules (with Identity & Facility split out as foundational):

| Schema name            | Owns (SDD module #)              | Notes                                  |
|------------------------|----------------------------------|----------------------------------------|
| `identity`             | Identity & Auth (1)              | Users, roles, sessions, MFA            |
| `facility`             | (foundational, used by all)      | Facility directory, departments        |
| `patient_registry`     | Patient Registry (2)             | Patient master, demographics, households|
| `health_id`            | Health ID & Eligibility (15)     | Health ID issuance, signing keys, QR   |
| `mch`                  | MCH Module (3)                   | Pregnancy, ANC, delivery, vaccinations |
| `mch_passport`         | Digital MCH Passport (16)        | Patient-held snapshots                 |
| `encounter`            | Clinical Encounter (4)           | Encounters, vitals, diagnoses          |
| `pharmacy`             | Pharmacy (5)                     | Prescriptions, dispensations, stock    |
| `laboratory`           | Laboratory (6)                   | Orders, results, specimens             |
| `referral`             | Referral & Transfer (7)          | Referrals, FHIR bundles, status        |
| `patient_portal`       | Patient Portal (8)               | Portal-specific state (preferences)    |
| `consent`              | (cross-cutting)                  | FHIR Consent resources                 |
| `audit`                | Audit & Compliance (13)          | Immutable audit log + hash chain       |
| `sync`                 | Sync Engine (14)                 | Outbox, inbox, sync status             |
| `catalog`              | (reference data — owned by Integration Gateway, Module 11) | Service catalog, ICD-11, formulary |
| `notification`         | Notification (12)                | Templates, deliveries                  |
| `analytics`            | Analytics (10)                   | Layer 3/4 only — materialized aggregates|
| `telemed`              | Telemedicine (9)                 | Phase 5 — stubbed                      |

Each schema:
- Has its own dedicated DB role (`danaya_<schema>_rw`, `danaya_<schema>_ro`).
- Application services connect as the schema's `_rw` role; cross-module reads via API call go through different roles.
- Migrations are versioned per schema in `/db/migrations/<schema>/V<n>__<desc>.sql`.

---

## 4. Core Identifiers & Common Conventions

### 4.1 Identifier types

| Identifier            | Type        | Format / Constraint                                          | Notes                                    |
|-----------------------|-------------|--------------------------------------------------------------|------------------------------------------|
| `danaya_patient_id`   | UUID (v7)   | UUIDv7                                                       | Internal canonical ID, MPI-anchored      |
| `danaya_health_id`    | TEXT(20)    | `BF-YYYY-NNNNNN-C` with Luhn-style checksum                  | Human-readable, printed on QR card        |
| `cnib_number`         | TEXT (enc)  | Burkinabè national ID, encrypted at rest                     | Optional; verified against CNIB registry |
| `danaya_user_id`      | UUID (v7)   | UUIDv7                                                       | Staff user                                |
| `danaya_facility_id`  | UUID (v7)   | UUIDv7                                                       | Facility — assigned at registration       |
| `event_id`            | UUID (v7)   | UUIDv7                                                       | Domain event / sync envelope             |
| `hlc_ts`              | BIGINT      | Monotonic logical timestamp                                  | Hybrid Logical Clock                      |

### 4.2 UUIDv7 generation

Postgres 15 ships without `uuidv7()` natively. Install the `pg_uuidv7` extension or use this PL/pgSQL fallback:

```sql
CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid AS $$
DECLARE
  ts_ms BIGINT;
  rand BYTEA;
  uuid_bytes BYTEA;
BEGIN
  ts_ms := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
  rand := gen_random_bytes(10);
  uuid_bytes :=
    set_byte(set_byte(set_byte(set_byte(set_byte(set_byte(rand, 0, ((ts_ms >> 40) & 255)::int), 0, 0), 0, 0), 0, 0), 0, 0), 0, 0);
  -- production: use pg_uuidv7 extension; this stub is illustrative
  RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql;
```

> **Production note.** The fallback above is a placeholder; ship `pg_uuidv7` from `fboulnois/pg_uuidv7` or migrate to Postgres 18+. ADR-017 will record the decision.

### 4.3 Standard audit columns (every table)

```sql
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
created_by  UUID        NOT NULL,
updated_by  UUID,
version     INT         NOT NULL DEFAULT 1,
hlc_ts      BIGINT      NOT NULL,
origin_facility_id UUID NOT NULL  -- which facility/layer created this row
```

A trigger on every table increments `version` and updates `updated_at` on UPDATE. Append-only clinical tables enforce immutability via trigger (`tg_<table>_immutable`).

### 4.4 Health ID format

`BF-YYYY-NNNNNN-C` where:
- `BF` — country code (constant).
- `YYYY` — year of issuance.
- `NNNNNN` — 6-digit sequence within year, base-32 (Crockford) to avoid ambiguous chars.
- `C` — single-character checksum, Mod-37 of preceding chars.

Total 14 characters (with separators), printable and dictatable. Decoded form stored as TEXT for queries; raw QR includes the same string + Ed25519 signature.

---

## 5. Patient Registry Schema (`patient_registry`)

### 5.1 `patients`

```sql
CREATE SCHEMA IF NOT EXISTS patient_registry;

CREATE TABLE patient_registry.patients (
    id                    UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    display_name          TEXT         NOT NULL,
    given_names           TEXT         NOT NULL,
    family_name           TEXT         NOT NULL,
    sex_at_birth          TEXT         NOT NULL CHECK (sex_at_birth IN ('M','F','I','U')),
    gender                TEXT,
    date_of_birth         DATE         NOT NULL,
    dob_precision         TEXT         NOT NULL DEFAULT 'day' CHECK (dob_precision IN ('day','month','year','approx')),
    place_of_birth        TEXT,
    place_of_birth_geo    geography(POINT,4326),
    primary_language      TEXT         NOT NULL DEFAULT 'fr',
    phone_enc             BYTEA,                              -- pgcrypto encrypted
    phone_hash            TEXT,                               -- HMAC for indexed search
    address_text          TEXT,
    address_admin1        TEXT,                               -- Region
    address_admin2        TEXT,                               -- Province
    address_admin3        TEXT,                               -- Commune
    household_id          UUID,
    is_deceased           BOOLEAN      NOT NULL DEFAULT FALSE,
    deceased_at           TIMESTAMPTZ,
    voided_at             TIMESTAMPTZ,
    void_reason           TEXT,
    merged_into_id        UUID         REFERENCES patient_registry.patients(id), -- MPI merge pointer
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID         NOT NULL,
    updated_by            UUID,
    version               INT          NOT NULL DEFAULT 1,
    hlc_ts                BIGINT       NOT NULL,
    origin_facility_id    UUID         NOT NULL
);

CREATE INDEX ix_patients_dob          ON patient_registry.patients (date_of_birth);
CREATE INDEX ix_patients_family_name  ON patient_registry.patients USING gin (family_name gin_trgm_ops);
CREATE INDEX ix_patients_display_name ON patient_registry.patients USING gin (display_name gin_trgm_ops);
CREATE INDEX ix_patients_phone_hash   ON patient_registry.patients (phone_hash);
CREATE INDEX ix_patients_household    ON patient_registry.patients (household_id);
CREATE INDEX ix_patients_merged_into  ON patient_registry.patients (merged_into_id) WHERE merged_into_id IS NOT NULL;
```

### 5.2 `patient_identifiers`

Holds external identifiers (CNIB, Health ID linkage as a foreign view, future passport, etc.) — one patient, many identifiers.

```sql
CREATE TABLE patient_registry.patient_identifiers (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id          UUID         NOT NULL REFERENCES patient_registry.patients(id),
    system              TEXT         NOT NULL,         -- 'cnib','passport','health_id', etc
    value_enc           BYTEA        NOT NULL,         -- encrypted
    value_hash          TEXT         NOT NULL,         -- HMAC for indexed search
    is_primary          BOOLEAN      NOT NULL DEFAULT FALSE,
    issued_at           DATE,
    expires_at          DATE,
    verified_at         TIMESTAMPTZ,
    verified_by         UUID,
    voided_at           TIMESTAMPTZ,
    void_reason         TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE UNIQUE INDEX uq_patient_identifiers_system_value
    ON patient_registry.patient_identifiers (system, value_hash)
    WHERE voided_at IS NULL;
CREATE INDEX ix_patient_identifiers_patient
    ON patient_registry.patient_identifiers (patient_id);
```

### 5.3 `households`

```sql
CREATE TABLE patient_registry.households (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    head_patient_id     UUID         REFERENCES patient_registry.patients(id),
    address_text        TEXT,
    address_geo         geography(POINT,4326),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);
```

`patients.household_id` is a logical FK (intra-schema, allowed) added by trigger or app — kept nullable to allow population over time.

---

## 6. Health ID Schema (`health_id`)

### 6.1 `health_ids`

```sql
CREATE SCHEMA IF NOT EXISTS health_id;

CREATE TABLE health_id.health_ids (
    id                    UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    value                 TEXT         NOT NULL,            -- e.g. BF-2026-A3K9P2-7
    patient_id            UUID         NOT NULL,            -- danaya_patient_id (logical FK)
    issued_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    issued_by             UUID         NOT NULL,
    issued_at_facility_id UUID         NOT NULL,
    status                TEXT         NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','revoked','superseded','lost')),
    revoked_at            TIMESTAMPTZ,
    revoke_reason         TEXT,
    superseded_by_id      UUID         REFERENCES health_id.health_ids(id),
    cnib_linked           BOOLEAN      NOT NULL DEFAULT FALSE,
    cnib_verified_at      TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID         NOT NULL,
    updated_by            UUID,
    version               INT          NOT NULL DEFAULT 1,
    hlc_ts                BIGINT       NOT NULL,
    origin_facility_id    UUID         NOT NULL
);

CREATE UNIQUE INDEX uq_health_ids_value  ON health_id.health_ids (value);
CREATE INDEX ix_health_ids_patient       ON health_id.health_ids (patient_id);
CREATE INDEX ix_health_ids_status        ON health_id.health_ids (status) WHERE status <> 'active';
```

### 6.2 `signing_keys`

Ed25519 keys used to sign QR cards and offline envelopes. Private keys live in an HSM or sealed secret store; the table holds metadata + public keys.

```sql
CREATE TABLE health_id.signing_keys (
    id                    UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    key_id                TEXT         NOT NULL UNIQUE,     -- kid for JWS header
    layer                 SMALLINT     NOT NULL CHECK (layer BETWEEN 2 AND 4),
    public_key_pem        TEXT         NOT NULL,
    algorithm             TEXT         NOT NULL DEFAULT 'Ed25519',
    activated_at          TIMESTAMPTZ  NOT NULL,
    retired_at            TIMESTAMPTZ,
    revoked_at            TIMESTAMPTZ,
    revoke_reason         TEXT,
    rotation_grace_until  TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID         NOT NULL,
    updated_by            UUID,
    version               INT          NOT NULL DEFAULT 1,
    hlc_ts                BIGINT       NOT NULL,
    origin_facility_id    UUID         NOT NULL
);

CREATE INDEX ix_signing_keys_layer_active
    ON health_id.signing_keys (layer)
    WHERE retired_at IS NULL AND revoked_at IS NULL;
```

### 6.3 `qr_issuances`

One row per QR card emission (re-prints get new rows; revocation marks status).

```sql
CREATE TABLE health_id.qr_issuances (
    id                    UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    health_id_id          UUID         NOT NULL REFERENCES health_id.health_ids(id),
    qr_payload            TEXT         NOT NULL,            -- the data payload signed
    signature             TEXT         NOT NULL,            -- Ed25519 signature, base64url
    signing_key_id        UUID         NOT NULL REFERENCES health_id.signing_keys(id),
    issued_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    issued_by             UUID         NOT NULL,
    issued_at_facility_id UUID         NOT NULL,
    expires_at            TIMESTAMPTZ,
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    revoked_at            TIMESTAMPTZ,
    revoke_reason         TEXT,
    print_count           INT          NOT NULL DEFAULT 1,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID         NOT NULL,
    updated_by            UUID,
    version               INT          NOT NULL DEFAULT 1,
    hlc_ts                BIGINT       NOT NULL,
    origin_facility_id    UUID         NOT NULL
);

CREATE INDEX ix_qr_issuances_health_id ON health_id.qr_issuances (health_id_id);
CREATE INDEX ix_qr_issuances_active    ON health_id.qr_issuances (is_active) WHERE is_active = TRUE;
```

---

## 7. MCH Module Schema (`mch`)

### 7.1 `pregnancies`

```sql
CREATE SCHEMA IF NOT EXISTS mch;

CREATE TABLE mch.pregnancies (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id             UUID         NOT NULL,           -- logical FK to patient_registry
    lmp_date               DATE,                            -- last menstrual period
    edd_date               DATE,                            -- expected date of delivery
    gravida                SMALLINT,
    para                   SMALLINT,
    abortions              SMALLINT,
    stillbirths            SMALLINT,
    living_children        SMALLINT,
    is_high_risk           BOOLEAN      NOT NULL DEFAULT FALSE,
    risk_factors           JSONB        NOT NULL DEFAULT '[]',
    status                 TEXT         NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','delivered','terminated','lost_to_followup','transferred')),
    closed_at              TIMESTAMPTZ,
    close_reason           TEXT,
    opened_at_facility_id  UUID         NOT NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL
);

CREATE INDEX ix_pregnancies_patient_active
    ON mch.pregnancies (patient_id)
    WHERE status = 'active';
CREATE INDEX ix_pregnancies_edd ON mch.pregnancies (edd_date);
CREATE INDEX ix_pregnancies_risk ON mch.pregnancies (is_high_risk) WHERE is_high_risk = TRUE;
```

### 7.2 `anc_visits`

Append-only.

```sql
CREATE TABLE mch.anc_visits (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    pregnancy_id           UUID         NOT NULL REFERENCES mch.pregnancies(id),
    patient_id             UUID         NOT NULL,
    visit_number           SMALLINT     NOT NULL,           -- 1..n, business rule >=4 for completion
    visit_date             DATE         NOT NULL,
    gestational_age_weeks  SMALLINT     CHECK (gestational_age_weeks BETWEEN 0 AND 45),
    weight_kg              NUMERIC(5,2),
    bp_systolic            SMALLINT,
    bp_diastolic           SMALLINT,
    fundal_height_cm       NUMERIC(4,1),
    fetal_heart_rate       SMALLINT,
    urine_protein          TEXT,
    urine_glucose          TEXT,
    hb_g_dl                NUMERIC(4,2),
    danger_signs           JSONB        NOT NULL DEFAULT '[]',
    interventions          JSONB        NOT NULL DEFAULT '[]',
    notes                  TEXT,
    supersedes_id          UUID         REFERENCES mch.anc_visits(id), -- corrections
    voided_at              TIMESTAMPTZ,
    void_reason            TEXT,
    visit_facility_id      UUID         NOT NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL,
    CONSTRAINT ck_anc_visits_bp CHECK (
        (bp_systolic IS NULL AND bp_diastolic IS NULL)
        OR (bp_systolic > bp_diastolic AND bp_systolic BETWEEN 50 AND 250)
    )
) PARTITION BY RANGE (visit_date);

-- Example partitions (script generates these monthly):
CREATE TABLE mch.anc_visits_2026_05 PARTITION OF mch.anc_visits
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE INDEX ix_anc_visits_pregnancy  ON mch.anc_visits (pregnancy_id, visit_number);
CREATE INDEX ix_anc_visits_patient    ON mch.anc_visits (patient_id, visit_date);
```

### 7.3 `deliveries`

```sql
CREATE TABLE mch.deliveries (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    pregnancy_id           UUID         NOT NULL REFERENCES mch.pregnancies(id),
    patient_id             UUID         NOT NULL,
    delivery_datetime      TIMESTAMPTZ  NOT NULL,
    delivery_mode          TEXT         NOT NULL CHECK (delivery_mode IN
                                ('spontaneous_vaginal','assisted_vaginal','caesarean_planned','caesarean_emergency','other')),
    gestational_age_weeks  SMALLINT,
    labor_duration_minutes INT,
    placenta_delivered     BOOLEAN,
    complications          JSONB        NOT NULL DEFAULT '[]',
    blood_loss_ml          INT,
    outcome                TEXT         NOT NULL CHECK (outcome IN
                                ('live_birth','stillbirth_antepartum','stillbirth_intrapartum','maternal_death','other')),
    delivery_facility_id   UUID         NOT NULL,
    attending_provider_id  UUID,
    notes                  TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL
);

CREATE UNIQUE INDEX uq_deliveries_pregnancy ON mch.deliveries (pregnancy_id);
CREATE INDEX ix_deliveries_patient ON mch.deliveries (patient_id);
CREATE INDEX ix_deliveries_outcome ON mch.deliveries (outcome) WHERE outcome <> 'live_birth';
```

### 7.4 `newborns`

```sql
CREATE TABLE mch.newborns (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    delivery_id            UUID         NOT NULL REFERENCES mch.deliveries(id),
    patient_id             UUID,                            -- created in patient_registry once registered
    birth_order            SMALLINT     NOT NULL DEFAULT 1, -- twins/triplets
    sex                    TEXT         NOT NULL CHECK (sex IN ('M','F','I','U')),
    birth_weight_g         INT,
    birth_length_cm        NUMERIC(4,1),
    head_circ_cm           NUMERIC(4,1),
    apgar_1min             SMALLINT     CHECK (apgar_1min BETWEEN 0 AND 10),
    apgar_5min             SMALLINT     CHECK (apgar_5min BETWEEN 0 AND 10),
    apgar_10min            SMALLINT     CHECK (apgar_10min BETWEEN 0 AND 10),
    resuscitation_needed   BOOLEAN      NOT NULL DEFAULT FALSE,
    congenital_anomalies   JSONB        NOT NULL DEFAULT '[]',
    outcome                TEXT         NOT NULL DEFAULT 'alive'
                                CHECK (outcome IN ('alive','died_within_24h','died_within_7d','died_within_28d')),
    notes                  TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL
);

CREATE INDEX ix_newborns_delivery ON mch.newborns (delivery_id);
CREATE INDEX ix_newborns_patient  ON mch.newborns (patient_id) WHERE patient_id IS NOT NULL;
```

### 7.5 `vaccinations`

```sql
CREATE TABLE mch.vaccinations (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id             UUID         NOT NULL,
    vaccine_code           TEXT         NOT NULL,           -- e.g. 'BCG','OPV0','PENTA1','MEASLES1'
    dose_number            SMALLINT     NOT NULL,
    administered_at        TIMESTAMPTZ  NOT NULL,
    scheduled_at           DATE,
    site                   TEXT,
    route                  TEXT,
    lot_number             TEXT,
    expiry_date            DATE,
    administered_by        UUID         NOT NULL,
    administered_at_facility_id UUID    NOT NULL,
    aefi_observed          BOOLEAN      NOT NULL DEFAULT FALSE,
    aefi_details           JSONB,
    voided_at              TIMESTAMPTZ,
    void_reason            TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL
);

CREATE INDEX ix_vaccinations_patient_vaccine ON mch.vaccinations (patient_id, vaccine_code, dose_number);
CREATE INDEX ix_vaccinations_administered_at ON mch.vaccinations (administered_at);
CREATE INDEX ix_vaccinations_scheduled ON mch.vaccinations (scheduled_at) WHERE administered_at IS NULL;
```

### 7.6 `growth_measurements`

Append-only, time-series, partitioned monthly.

```sql
CREATE TABLE mch.growth_measurements (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id             UUID         NOT NULL,
    measured_at            TIMESTAMPTZ  NOT NULL,
    age_months             SMALLINT,
    weight_kg              NUMERIC(5,2),
    height_cm              NUMERIC(5,2),
    muac_cm                NUMERIC(4,1),
    head_circ_cm           NUMERIC(4,1),
    weight_for_age_z       NUMERIC(4,2),
    height_for_age_z       NUMERIC(4,2),
    weight_for_height_z    NUMERIC(4,2),
    nutrition_flag         TEXT         CHECK (nutrition_flag IN
                                ('normal','at_risk','MAM','SAM','overweight','obese')),
    measured_by            UUID         NOT NULL,
    measured_at_facility_id UUID        NOT NULL,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL
) PARTITION BY RANGE (measured_at);

CREATE INDEX ix_growth_patient ON mch.growth_measurements (patient_id, measured_at DESC);
CREATE INDEX ix_growth_flag    ON mch.growth_measurements (nutrition_flag) WHERE nutrition_flag IN ('MAM','SAM');
```

---

## 8. Digital MCH Passport Schema (`mch_passport`)

The Passport is a **derived view** held by the patient. Authoritative truth stays in `mch`; this schema persists signed snapshots and consent grants.

### 8.1 `mch_passport_snapshots`

```sql
CREATE SCHEMA IF NOT EXISTS mch_passport;

CREATE TABLE mch_passport.mch_passport_snapshots (
    id                    UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id            UUID         NOT NULL,
    snapshot_payload      JSONB        NOT NULL,            -- minimum-necessary view
    snapshot_hash         TEXT         NOT NULL,            -- sha256 of canonical payload
    signature             TEXT         NOT NULL,            -- Ed25519 sig, base64url
    signing_key_id        UUID         NOT NULL,            -- logical FK to health_id.signing_keys
    issued_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    issued_by             UUID         NOT NULL,
    issued_at_facility_id UUID         NOT NULL,
    expires_at            TIMESTAMPTZ,
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    revoked_at            TIMESTAMPTZ,
    revoke_reason         TEXT,
    delivery_channel      TEXT         CHECK (delivery_channel IN ('paper','pwa','sms','ussd')),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID         NOT NULL,
    updated_by            UUID,
    version               INT          NOT NULL DEFAULT 1,
    hlc_ts                BIGINT       NOT NULL,
    origin_facility_id    UUID         NOT NULL
);

CREATE INDEX ix_mch_snapshots_patient_active
    ON mch_passport.mch_passport_snapshots (patient_id)
    WHERE is_active = TRUE;
CREATE INDEX ix_mch_snapshots_hash
    ON mch_passport.mch_passport_snapshots (snapshot_hash);
```

### 8.2 `passport_proxy_grants`

Family / proxy access to a patient's passport.

```sql
CREATE TABLE mch_passport.passport_proxy_grants (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id          UUID         NOT NULL,
    proxy_patient_id    UUID         NOT NULL,             -- the granted person
    relationship        TEXT         NOT NULL,             -- spouse, parent, sibling, guardian, other
    scope               JSONB        NOT NULL,             -- which fields/sections
    granted_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoke_reason       TEXT,
    consent_record_id   UUID         NOT NULL,             -- logical FK to consent.consent_records
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_passport_proxy_patient ON mch_passport.passport_proxy_grants (patient_id);
CREATE INDEX ix_passport_proxy_grantee ON mch_passport.passport_proxy_grants (proxy_patient_id);
```

---

## 9. Clinical Encounter Schema (`encounter`)

### 9.1 `encounters`

```sql
CREATE SCHEMA IF NOT EXISTS encounter;

CREATE TABLE encounter.encounters (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id          UUID         NOT NULL,
    encounter_type      TEXT         NOT NULL CHECK (encounter_type IN
                            ('outpatient','inpatient','emergency','anc','postnatal','vaccination','teleconsult','other')),
    started_at          TIMESTAMPTZ  NOT NULL,
    ended_at            TIMESTAMPTZ,
    status              TEXT         NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','completed','cancelled')),
    primary_provider_id UUID,
    facility_id         UUID         NOT NULL,
    department          TEXT,
    chief_complaint     TEXT,
    notes               TEXT,
    related_pregnancy_id UUID,                              -- logical FK to mch.pregnancies
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
) PARTITION BY RANGE (started_at);

CREATE INDEX ix_encounters_patient ON encounter.encounters (patient_id, started_at DESC);
CREATE INDEX ix_encounters_facility_open
    ON encounter.encounters (facility_id)
    WHERE status = 'in_progress';
```

### 9.2 `vitals`

Append-only, time-series.

```sql
CREATE TABLE encounter.vitals (
    id                 UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    encounter_id       UUID         NOT NULL,
    patient_id         UUID         NOT NULL,
    recorded_at        TIMESTAMPTZ  NOT NULL,
    bp_systolic        SMALLINT,
    bp_diastolic       SMALLINT,
    heart_rate         SMALLINT,
    respiratory_rate   SMALLINT,
    temperature_c      NUMERIC(4,1),
    spo2               SMALLINT,
    weight_kg          NUMERIC(5,2),
    height_cm          NUMERIC(5,1),
    pain_score         SMALLINT     CHECK (pain_score BETWEEN 0 AND 10),
    recorded_by        UUID         NOT NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by         UUID         NOT NULL,
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by         UUID,
    version            INT          NOT NULL DEFAULT 1,
    hlc_ts             BIGINT       NOT NULL,
    origin_facility_id UUID         NOT NULL
) PARTITION BY RANGE (recorded_at);

CREATE INDEX ix_vitals_encounter ON encounter.vitals USING brin (recorded_at);
CREATE INDEX ix_vitals_patient   ON encounter.vitals (patient_id, recorded_at DESC);
```

### 9.3 `diagnoses`

```sql
CREATE TABLE encounter.diagnoses (
    id                 UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    encounter_id       UUID         NOT NULL,
    patient_id         UUID         NOT NULL,
    icd11_code         TEXT         NOT NULL,
    icd11_label        TEXT         NOT NULL,
    is_primary         BOOLEAN      NOT NULL DEFAULT FALSE,
    onset_date         DATE,
    resolved_date      DATE,
    severity           TEXT         CHECK (severity IN ('mild','moderate','severe','critical')),
    notes              TEXT,
    diagnosed_by       UUID         NOT NULL,
    diagnosed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    supersedes_id      UUID         REFERENCES encounter.diagnoses(id),
    voided_at          TIMESTAMPTZ,
    void_reason        TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by         UUID         NOT NULL,
    updated_by         UUID,
    version            INT          NOT NULL DEFAULT 1,
    hlc_ts             BIGINT       NOT NULL,
    origin_facility_id UUID         NOT NULL
);

CREATE INDEX ix_diagnoses_encounter ON encounter.diagnoses (encounter_id);
CREATE INDEX ix_diagnoses_patient   ON encounter.diagnoses (patient_id, diagnosed_at DESC);
CREATE INDEX ix_diagnoses_icd11     ON encounter.diagnoses (icd11_code);
```

---

## 10. Pharmacy Schema (`pharmacy`)

Key tables and relationships:

| Table              | Purpose                                                                   |
|--------------------|---------------------------------------------------------------------------|
| `medications`      | Local formulary cache (mirror of `catalog.drug_formulary`)                 |
| `allergies`        | Patient allergies — append-only, supersedes pattern                       |
| `prescriptions`    | Doctor's order (header)                                                   |
| `prescription_items`| Line items (one per drug)                                                 |
| `dispensations`    | Pharmacist's dispensation events — append-only                            |
| `stock_movements`  | CRDT-style increments/decrements; PN-counter                              |
| `stock_levels`     | Materialized view, refreshed on movement insert                           |

### 10.1 `prescriptions`

```sql
CREATE SCHEMA IF NOT EXISTS pharmacy;

CREATE TABLE pharmacy.prescriptions (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    encounter_id        UUID         NOT NULL,
    patient_id          UUID         NOT NULL,
    prescribed_by       UUID         NOT NULL,
    prescribed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status              TEXT         NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','partially_dispensed','dispensed','cancelled','expired')),
    cancellation_reason TEXT,
    facility_id         UUID         NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_prescriptions_patient_active
    ON pharmacy.prescriptions (patient_id) WHERE status IN ('active','partially_dispensed');
CREATE INDEX ix_prescriptions_encounter ON pharmacy.prescriptions (encounter_id);
```

### 10.2 `prescription_items`

```sql
CREATE TABLE pharmacy.prescription_items (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    prescription_id     UUID         NOT NULL REFERENCES pharmacy.prescriptions(id),
    medication_code     TEXT         NOT NULL,
    medication_label    TEXT         NOT NULL,
    dose                TEXT         NOT NULL,            -- "500 mg"
    frequency           TEXT         NOT NULL,            -- "TID"
    route               TEXT         NOT NULL,            -- "PO"
    duration_days       SMALLINT,
    quantity_total      NUMERIC(10,2),
    quantity_unit       TEXT,
    instructions        TEXT,
    is_prn              BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_rx_items_prescription ON pharmacy.prescription_items (prescription_id);
CREATE INDEX ix_rx_items_medication   ON pharmacy.prescription_items (medication_code);
```

### 10.3 `dispensations` (append-only)

```sql
CREATE TABLE pharmacy.dispensations (
    id                     UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    prescription_item_id   UUID         NOT NULL REFERENCES pharmacy.prescription_items(id),
    patient_id             UUID         NOT NULL,
    quantity_dispensed     NUMERIC(10,2) NOT NULL,
    quantity_unit          TEXT         NOT NULL,
    lot_number             TEXT,
    expiry_date            DATE,
    dispensed_by           UUID         NOT NULL,
    dispensed_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    dispensed_at_facility_id UUID       NOT NULL,
    allergy_override       BOOLEAN      NOT NULL DEFAULT FALSE,
    allergy_override_reason TEXT,
    duplicate_override     BOOLEAN      NOT NULL DEFAULT FALSE,
    duplicate_override_reason TEXT,
    voided_at              TIMESTAMPTZ,
    void_reason            TEXT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by             UUID         NOT NULL,
    updated_by             UUID,
    version                INT          NOT NULL DEFAULT 1,
    hlc_ts                 BIGINT       NOT NULL,
    origin_facility_id     UUID         NOT NULL
);

CREATE INDEX ix_dispensations_patient ON pharmacy.dispensations (patient_id, dispensed_at DESC);
CREATE INDEX ix_dispensations_item    ON pharmacy.dispensations (prescription_item_id);
```

### 10.4 `stock_movements` (PN-counter CRDT)

```sql
CREATE TABLE pharmacy.stock_movements (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    facility_id         UUID         NOT NULL,
    medication_code     TEXT         NOT NULL,
    movement_type       TEXT         NOT NULL CHECK (movement_type IN
                            ('receipt','dispensation','adjustment_plus','adjustment_minus','expired','transfer_in','transfer_out')),
    quantity            NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    sign                SMALLINT     NOT NULL CHECK (sign IN (1,-1)),
    lot_number          TEXT,
    expiry_date         DATE,
    related_dispensation_id UUID,
    actor_id            UUID         NOT NULL,
    moved_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_stock_facility_med ON pharmacy.stock_movements (facility_id, medication_code, moved_at);
```

`stock_levels` is a materialized view:

```sql
CREATE MATERIALIZED VIEW pharmacy.stock_levels AS
SELECT
    facility_id,
    medication_code,
    SUM(quantity * sign) AS quantity_on_hand
FROM pharmacy.stock_movements
GROUP BY facility_id, medication_code;
```

### 10.5 `allergies`

```sql
CREATE TABLE pharmacy.allergies (
    id                 UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id         UUID         NOT NULL,
    allergen_type      TEXT         NOT NULL CHECK (allergen_type IN ('drug','food','environmental','other')),
    allergen_code      TEXT,
    allergen_label     TEXT         NOT NULL,
    severity           TEXT         CHECK (severity IN ('mild','moderate','severe','life_threatening')),
    reaction           TEXT,
    recorded_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    recorded_by        UUID         NOT NULL,
    supersedes_id      UUID         REFERENCES pharmacy.allergies(id),
    voided_at          TIMESTAMPTZ,
    void_reason        TEXT,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by         UUID         NOT NULL,
    updated_by         UUID,
    version            INT          NOT NULL DEFAULT 1,
    hlc_ts             BIGINT       NOT NULL,
    origin_facility_id UUID         NOT NULL
);

CREATE INDEX ix_allergies_patient_active
    ON pharmacy.allergies (patient_id)
    WHERE voided_at IS NULL;
```

---

## 11. Laboratory Schema (`laboratory`)

Tables:
- `lab_orders` — order header (encounter-linked).
- `lab_order_items` — one test per row.
- `specimens` — physical sample tracking, barcoded.
- `lab_results` — append-only result entries; partitioned monthly.
- `reference_ranges` — per analyte, age/sex bands.

Result table (most active):

```sql
CREATE SCHEMA IF NOT EXISTS laboratory;

CREATE TABLE laboratory.lab_results (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    lab_order_item_id   UUID         NOT NULL,
    patient_id          UUID         NOT NULL,
    encounter_id        UUID,
    analyte_code        TEXT         NOT NULL,
    analyte_label       TEXT         NOT NULL,
    value_numeric       NUMERIC(20,6),
    value_text          TEXT,
    unit                TEXT,
    reference_low       NUMERIC(20,6),
    reference_high      NUMERIC(20,6),
    interpretation      TEXT         CHECK (interpretation IN
                            ('normal','low','high','critical_low','critical_high','abnormal','positive','negative','indeterminate')),
    is_abnormal         BOOLEAN      GENERATED ALWAYS AS (interpretation NOT IN ('normal','negative')) STORED,
    resulted_at         TIMESTAMPTZ  NOT NULL,
    validated_at        TIMESTAMPTZ,
    validated_by        UUID,
    resulted_by         UUID         NOT NULL,
    method              TEXT,
    instrument          TEXT,
    notes               TEXT,
    supersedes_id       UUID,
    voided_at           TIMESTAMPTZ,
    void_reason         TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
) PARTITION BY RANGE (resulted_at);

CREATE INDEX ix_lab_results_patient  ON laboratory.lab_results (patient_id, resulted_at DESC);
CREATE INDEX ix_lab_results_abnormal ON laboratory.lab_results (patient_id) WHERE is_abnormal = TRUE;
CREATE INDEX ix_lab_results_analyte  ON laboratory.lab_results (analyte_code, resulted_at);
```

`lab_orders`, `lab_order_items`, `specimens` follow the same pattern (header / line item / physical artifact tracking) — full DDL deferred to migration files, mirroring the prescription/dispensation structure of §10.

---

## 12. Referral & Transfer Schema (`referral`)

Tables:
- `referrals` — referral envelope header.
- `referral_bundles` — FHIR Bundle payload + signature.
- `referral_status_events` — append-only state history.
- `transport_events` — ambulance dispatch, arrival, etc.

### 12.1 `referrals`

```sql
CREATE SCHEMA IF NOT EXISTS referral;

CREATE TABLE referral.referrals (
    id                          UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id                  UUID         NOT NULL,
    origin_encounter_id         UUID         NOT NULL,
    origin_facility_id          UUID         NOT NULL,
    destination_facility_id     UUID         NOT NULL,
    reason                      TEXT         NOT NULL,
    clinical_summary            TEXT,
    urgency                     TEXT         NOT NULL CHECK (urgency IN ('routine','urgent','emergency')),
    requested_by                UUID         NOT NULL,
    requested_at                TIMESTAMPTZ  NOT NULL DEFAULT now(),
    status                      TEXT         NOT NULL DEFAULT 'created'
                                    CHECK (status IN ('created','dispatched','in_transit','received','completed','cancelled','lost')),
    completed_at                TIMESTAMPTZ,
    cancellation_reason         TEXT,
    consent_record_id           UUID         NOT NULL,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by                  UUID         NOT NULL,
    updated_by                  UUID,
    version                     INT          NOT NULL DEFAULT 1,
    hlc_ts                      BIGINT       NOT NULL
);

CREATE INDEX ix_referrals_patient            ON referral.referrals (patient_id, requested_at DESC);
CREATE INDEX ix_referrals_destination_open
    ON referral.referrals (destination_facility_id)
    WHERE status IN ('dispatched','in_transit','received');
CREATE INDEX ix_referrals_urgency_open
    ON referral.referrals (urgency)
    WHERE status NOT IN ('completed','cancelled','lost');
```

### 12.2 `referral_bundles`

```sql
CREATE TABLE referral.referral_bundles (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    referral_id         UUID         NOT NULL REFERENCES referral.referrals(id),
    fhir_bundle         JSONB        NOT NULL,
    bundle_hash         TEXT         NOT NULL,
    signature           TEXT         NOT NULL,
    signing_key_id      UUID         NOT NULL,
    message_id          UUID         NOT NULL UNIQUE,           -- de-duplication key
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_referral_bundles_referral ON referral.referral_bundles (referral_id);
```

### 12.3 `referral_status_events` (append-only)

```sql
CREATE TABLE referral.referral_status_events (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    referral_id         UUID         NOT NULL REFERENCES referral.referrals(id),
    new_status          TEXT         NOT NULL,
    occurred_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    occurred_at_facility_id UUID,
    actor_id            UUID         NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_referral_events_referral_time
    ON referral.referral_status_events (referral_id, occurred_at);
```

---

## 13. Consent and Audit Schemas

### 13.1 `consent.consent_records`

```sql
CREATE SCHEMA IF NOT EXISTS consent;

CREATE TABLE consent.consent_records (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    patient_id          UUID         NOT NULL,
    consent_type        TEXT         NOT NULL CHECK (consent_type IN
                            ('treatment','data_share_facility','data_share_research','proxy_access',
                             'mch_passport_share','telemed','emergency_override','other')),
    scope               JSONB        NOT NULL,           -- which data, with whom, for what
    granted             BOOLEAN      NOT NULL,
    granted_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    granted_by_role     TEXT         NOT NULL,           -- 'patient' | 'proxy' | 'clinician_emergency'
    captured_by         UUID         NOT NULL,           -- staff who recorded
    expires_at          TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    revoke_reason       TEXT,
    signature_method    TEXT         CHECK (signature_method IN
                            ('signature_pad','thumbprint_image','witnessed_verbal','sms_otp','pwa_click','paper_scanned')),
    signature_payload   BYTEA,
    related_grant_id    UUID         REFERENCES consent.consent_records(id),
    facility_id         UUID         NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_consent_patient_type_active
    ON consent.consent_records (patient_id, consent_type)
    WHERE granted = TRUE AND revoked_at IS NULL;
```

### 13.2 `audit.audit_log` (append-only, hash-chained, monthly-partitioned)

```sql
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.audit_log (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    occurred_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    actor_id            UUID,                          -- NULL only for system events
    actor_role          TEXT,
    facility_id         UUID,
    patient_id          UUID,                          -- subject, if applicable
    target_resource     TEXT         NOT NULL,         -- e.g. 'patient_registry.patients'
    target_id           UUID,
    action              TEXT         NOT NULL CHECK (action IN
                            ('read','create','update','delete','login','logout','login_failed',
                             'consent_grant','consent_revoke','break_glass','export','print','sync_send','sync_receive')),
    outcome             TEXT         NOT NULL CHECK (outcome IN ('success','denied','error')),
    reason              TEXT,                          -- supplied for break_glass, denials, etc
    correlation_id      UUID,
    request_metadata    JSONB,                         -- ip, user_agent, session_id (no PHI here)
    prev_hash           BYTEA,                         -- hash chain
    row_hash            BYTEA        NOT NULL,         -- sha256 over canonical row + prev_hash
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1
) PARTITION BY RANGE (occurred_at);

CREATE INDEX ix_audit_actor_time   ON audit.audit_log (actor_id, occurred_at);
CREATE INDEX ix_audit_patient_time ON audit.audit_log (patient_id, occurred_at);
CREATE INDEX ix_audit_target       ON audit.audit_log (target_resource, target_id);

-- Trigger enforces immutability:
CREATE OR REPLACE FUNCTION audit.tg_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit.audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_audit_log_immutable_upd
    BEFORE UPDATE OR DELETE ON audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION audit.tg_immutable();
```

Monthly hash chain checkpoints persist in `audit.hash_chain_checkpoints` and are shipped to Layer 3 + offsite — tamper-evident even against a privileged insider.

```sql
CREATE TABLE audit.hash_chain_checkpoints (
    id              UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    facility_id     UUID         NOT NULL,
    period_start    TIMESTAMPTZ  NOT NULL,
    period_end      TIMESTAMPTZ  NOT NULL,
    last_audit_id   UUID         NOT NULL,
    chain_hash      BYTEA        NOT NULL,
    signed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    signing_key_id  UUID         NOT NULL,
    signature       TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by      UUID         NOT NULL,
    updated_by      UUID,
    version         INT          NOT NULL DEFAULT 1,
    hlc_ts          BIGINT       NOT NULL
);

CREATE UNIQUE INDEX uq_checkpoints_period
    ON audit.hash_chain_checkpoints (facility_id, period_start);
```

---

## 14. Sync Engine Schema (`sync`)

### 14.1 `outbox_events`

```sql
CREATE SCHEMA IF NOT EXISTS sync;

CREATE TABLE sync.outbox_events (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    event_type          TEXT         NOT NULL,
    aggregate_type      TEXT         NOT NULL,        -- schema.table
    aggregate_id        UUID         NOT NULL,
    payload             JSONB        NOT NULL,
    idempotency_key     TEXT         NOT NULL UNIQUE,
    origin_facility_id  UUID         NOT NULL,
    destination_layer   SMALLINT     NOT NULL CHECK (destination_layer BETWEEN 2 AND 4),
    status              TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','in_flight','delivered','failed','expired')),
    attempts            INT          NOT NULL DEFAULT 0,
    last_attempt_at     TIMESTAMPTZ,
    last_error          TEXT,
    delivered_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    hlc_ts              BIGINT       NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1
);

CREATE INDEX ix_outbox_pending
    ON sync.outbox_events (status, created_at)
    WHERE status IN ('pending','in_flight','failed');
```

### 14.2 `inbox_events`

```sql
CREATE TABLE sync.inbox_events (
    id                    UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    source_facility_id    UUID         NOT NULL,
    source_event_id       UUID         NOT NULL,        -- the sender's outbox event id
    event_type            TEXT         NOT NULL,
    aggregate_type        TEXT         NOT NULL,
    aggregate_id          UUID         NOT NULL,
    payload               JSONB        NOT NULL,
    received_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    processed_at          TIMESTAMPTZ,
    status                TEXT         NOT NULL DEFAULT 'received'
                              CHECK (status IN ('received','processed','rejected','requires_review','duplicate')),
    rejection_reason      TEXT,
    hlc_ts_source         BIGINT       NOT NULL,
    hlc_ts                BIGINT       NOT NULL,        -- local HLC on receipt
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID         NOT NULL,
    updated_by            UUID,
    version               INT          NOT NULL DEFAULT 1,
    origin_facility_id    UUID         NOT NULL
);

CREATE UNIQUE INDEX uq_inbox_source_event
    ON sync.inbox_events (source_facility_id, source_event_id);
CREATE INDEX ix_inbox_unprocessed
    ON sync.inbox_events (status, received_at)
    WHERE status IN ('received','requires_review');
```

### 14.3 `sync_status`

One row per (facility, peer-layer); read for dashboards and alerts.

```sql
CREATE TABLE sync.sync_status (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    facility_id         UUID         NOT NULL,
    peer_layer          SMALLINT     NOT NULL CHECK (peer_layer BETWEEN 2 AND 4),
    last_outbound_at    TIMESTAMPTZ,
    last_inbound_at     TIMESTAMPTZ,
    outbound_pending    INT          NOT NULL DEFAULT 0,
    inbound_pending     INT          NOT NULL DEFAULT 0,
    outbound_lag_seconds INT,
    health              TEXT         NOT NULL DEFAULT 'unknown'
                            CHECK (health IN ('green','yellow','red','unknown')),
    last_error          TEXT,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE UNIQUE INDEX uq_sync_status_facility_peer
    ON sync.sync_status (facility_id, peer_layer);
```

---

## 15. National Service Catalog Schema (`catalog`)

Reference data, owned by Module 11 (Integration Gateway). Lives at Layer 4, replicated to Layer 2/3 (read-only).

```sql
CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE catalog.service_catalog (
    id                  UUID         PRIMARY KEY DEFAULT public.uuidv7(),
    service_code        TEXT         NOT NULL UNIQUE,
    service_label_fr    TEXT         NOT NULL,
    service_label_local JSONB        NOT NULL DEFAULT '{}',   -- {moore:..., dioula:..., fulfulde:...}
    category            TEXT         NOT NULL,                -- e.g. 'mch','lab','imaging','referral'
    unit_basis          TEXT         NOT NULL,                -- 'per_act','per_day','per_test'
    standard_price_xof  NUMERIC(10,2),                        -- optional for future claims
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    effective_from      DATE         NOT NULL,
    effective_to        DATE,
    metadata            JSONB,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID         NOT NULL,
    updated_by          UUID,
    version             INT          NOT NULL DEFAULT 1,
    hlc_ts              BIGINT       NOT NULL,
    origin_facility_id  UUID         NOT NULL
);

CREATE INDEX ix_catalog_category_active
    ON catalog.service_catalog (category)
    WHERE is_active = TRUE;
```

Companion tables (described, DDL deferred):
- `catalog.icd11_codes` — ICD-11 reference table (cached from WHO).
- `catalog.drug_formulary` — national formulary; rows feed `pharmacy.medications`.
- `catalog.vaccine_schedule` — EPI schedule template, drives `mch.vaccinations` due dates.

---

## 16. Indexing Strategy

| Pattern                            | Index type        | Example                                          |
|------------------------------------|-------------------|--------------------------------------------------|
| Primary key lookup                 | btree (PK)        | `patients.id`                                    |
| Foreign / parent lookup            | btree             | `anc_visits(pregnancy_id, visit_number)`         |
| Time-series scans                  | BRIN              | `vitals(recorded_at)`                            |
| Fuzzy name search                  | GIN trigram       | `patients(display_name gin_trgm_ops)`            |
| Partial / status-filtered lookup   | partial btree     | `prescriptions(patient_id) WHERE status='active'`|
| Active-only uniqueness             | partial unique    | `health_ids(value) WHERE status='active'`        |
| Encrypted-field equality search    | HMAC hash column  | `patient_identifiers(value_hash)`                |
| JSONB lookup (specific path)       | GIN expression    | `vaccinations((aefi_details->>'severity'))`      |
| Computed flag                      | generated + index | `lab_results(is_abnormal)`                       |

**Rule of thumb.** No index without a query that justifies it; every new index goes through migration review + `EXPLAIN ANALYZE` on representative data. Indexes are listed in the Test Plan as part of performance regression.

---

## 17. Offline Conflict Handling at the DB Layer

Three policies, encoded in code and supported by schema:

### 17.1 Append-only (no conflict possible)
Clinical entries (`anc_visits`, `deliveries`, `vaccinations`, `growth_measurements`, `vitals`, `diagnoses`, `dispensations`, `lab_results`, `audit_log`, `referral_status_events`). Two facilities can each insert; both rows survive; the application reads "most recent non-voided." Corrections use `supersedes_id`.

### 17.2 Last-Writer-Wins with layer priority (demographics, configuration)
- Compare `(hlc_ts, layer_priority)`; higher HLC wins; layer priority breaks ties.
- Triggers check that `incoming.hlc_ts >= existing.hlc_ts` on UPDATE from sync.
- `version` increments monotonically.

### 17.3 CRDT counter (`pharmacy.stock_movements`)
- Increments and decrements are independent rows, never overwritten.
- `stock_levels` materialized view is the convergent merge.
- Negative stock alarm fires from a check job; never blocks the write.

### 17.4 State-machine reconciliation (`referrals.status`, `prescriptions.status`)
- Allowed transitions defined in code; a CHECK constraint or trigger rejects illegal transitions arriving from sync.
- On rejection: the record is queued to `sync.inbox_events` with `status='requires_review'` and surfaced to a referral coordinator.

> **Analogy.** Three reconciliation moods: pile up everything (append), keep only the newest stamp (LWW), and let everyone tally the bag (CRDT). Plus a fourth mood — "no, that move isn't legal" — for workflows that have rules.

---

## 18. Data Retention and Backup Rules

### 18.1 Retention

| Data class                                    | Retention    | Rationale                                       |
|-----------------------------------------------|--------------|-------------------------------------------------|
| Clinical records (encounter, MCH, lab, etc.)  | 30 years     | Long-term medical record obligation              |
| Audit log                                     | 10 years (min)| Compliance + insider-threat investigation        |
| Consent records                               | Lifetime + 30y| Tied to clinical retention                       |
| Operational queues (outbox / inbox after delivery) | 90 days  | Sufficient for replay / debugging                |
| Notification delivery receipts                | 1 year       | Audit + service quality                          |
| Analytics aggregates                          | Indefinite   | Already de-identified at Layer 4                 |
| Voided rows                                   | Same as base | Tombstones don't reduce footprint significantly  |

### 18.2 Backup matrix

| Layer | Mechanism                          | Frequency | Destination       | Encryption           |
|-------|------------------------------------|-----------|-------------------|----------------------|
| 2     | WAL streaming                      | Continuous| Layer 3 hot copy  | TLS in transit       |
| 2     | `pg_basebackup` full               | Nightly   | Layer 3 archive   | At rest + offline    |
| 3     | `pg_basebackup` full               | Nightly   | Layer 4 + offsite | At rest + offline    |
| 3     | Hash-chain checkpoints (audit)     | Monthly   | Layer 4 + offsite | Ed25519 signed       |
| All   | Encrypted external drive rotation  | Weekly    | District archive  | LUKS, key-escrowed   |

**RPO / RTO targets**:
- Layer 2: RPO ≤ 1 h, RTO ≤ 4 h
- Layer 3: RPO ≤ 15 min, RTO ≤ 1 h
- Layer 4: RPO ≤ 5 min, RTO ≤ 30 min

Quarterly restore drills are mandatory and tracked as a Kaizen indicator.

### 18.3 Encryption keys lifecycle
- Column-level data encryption keys (DEK): rotated quarterly. Re-encryption is batched, non-blocking, audited.
- QR signing keys (Ed25519): rotated annually with 90-day overlap so old QR cards remain verifiable.
- Backup encryption keys: rotated semi-annually, escrowed in two-person physical custody.

---

## 19. Migration Strategy

### 19.1 Tooling
- **Alembic** (Python, FastAPI-native) for application-managed migrations.
- One Alembic environment per schema; each schema has its own version graph.
- Migrations are SQL-first (`op.execute()` with hand-written SQL); ORM auto-gen is forbidden for production migrations.

### 19.2 Migration rules
1. **Forward-only.** No downgrade scripts in production; rollback is a forward "revert migration."
2. **Backwards-compatible by default.** Any schema change must support the previous app version for one full release cycle.
3. **Three-step destructive changes** (e.g., dropping a column):
   - Release N: stop writing to the column.
   - Release N+1: stop reading.
   - Release N+2: drop.
4. **Online migrations** for tables > 10⁵ rows: use `CREATE INDEX CONCURRENTLY`, `ALTER TABLE ... ADD COLUMN` with `NULL` default, never `DEFAULT <expr>` on large tables (Postgres 11+ makes some of these instant, but rule survives upgrade churn).
5. **Migrations run before app deploy.** App container won't start if migration head doesn't match expected revision.
6. **Cross-facility coordination.** Layer 2 facilities receive migration via Ansible push; orchestrator waits for ack from each before marking the release "rolled out." A facility offline for > 7 days falls into "stale schema" and triggers an alert; sync still functions due to backwards-compat rules.

### 19.3 Schema versioning
Each schema has a `_meta.schema_version` table containing the active migration head. Sync envelopes carry `sender_schema_version`; mismatches trigger compatibility mode (read-only on the affected aggregate) instead of error.

---

## 20. Phase-1 Spine — Build Order

Tables to deliver in Phase 1 (first 90 days), in dependency order:

1. `facility.facilities` (foundational — referenced by every row's `origin_facility_id`).
2. `identity.users`, `identity.roles`, `identity.user_roles`.
3. `patient_registry.patients`, `patient_registry.patient_identifiers`, `patient_registry.households`.
4. `health_id.signing_keys`, `health_id.health_ids`, `health_id.qr_issuances`.
5. `consent.consent_records`.
6. `audit.audit_log`, `audit.hash_chain_checkpoints` (must exist before any clinical insert).
7. `sync.outbox_events`, `sync.inbox_events`, `sync.sync_status`.

These eleven tables form **the spine**. Every later module hangs off them. Phase 2 then adds the MCH package (7 tables in §7) plus `encounter.*`, `pharmacy.*`, `laboratory.*`.

---

## 21. Next Documents

1. **API Specification** — OpenAPI 3.1 + DANAYA-BF FHIR Implementation Guide. Will reference these schemas directly via response schemas.
2. **Security Architecture** — full controls catalog, including Health ID signing key lifecycle, audit hash chain verification protocol, column-encryption KMS design.
3. **Project Management Plan** — schedule and ownership.
4. **Test Plan** — schema fixtures, contract tests per module, migration replay tests, sync chaos tests.
5. **Deployment Guide** — Ansible playbooks, schema bootstrap, restore drills.

---

## 22. Open Questions (to resolve before Phase 2)

1. Postgres `uuidv7()` strategy — `pg_uuidv7` extension, fallback function, or wait for Postgres 18 baseline? *ADR-017.*
2. Audit log partition rotation cadence (monthly confirmed; do we keep online > 24 months?). *ADR-018.*
3. Column-encryption KMS — Vault Transit, AWS KMS, or sovereign HSM? *Security Architecture.*
4. Address admin levels — bind to a national reference table from INSD or denormalize as text? *ADR-019.*
5. National `vaccine_schedule` source — PEV Burkina Faso reference; confirm authoritative version. *Catalog onboarding doc.*

---

*« Danaya ka kɛnɛya. » — A schema is a promise the data keeps. Every table here is a promise to the patient.*
