> Historical proposal/reference, not a description of the implemented Danaya 0.2 release. See the root README and current docs/ARCHITECTURE.md.

# DANAYA — System Design Document (SDD)

**Project:** DANAYA — National Digital Health Platform of Burkina Faso
**Document:** System Design Document, v1.1
**Status:** Baseline + Japan Reference Integration
**Authors:** A. Kader / DANAYA Architecture Working Group
**Date:** 2026-05-17
**Related artifacts:** SRS v1.0, Production Roadmap, Logical Data Model, JICA Alignment Document
**Repository:** https://github.com/Conqueror226/danaya

> **Naming.** The canonical project name is **DANAYA** (Dioula: *trust, confidence*). Earlier drafts containing "DAYANA" are non-canonical and superseded by this document.

---

## 0. Document Control

| Version | Date       | Author    | Change                                                                                          |
|---------|------------|-----------|-------------------------------------------------------------------------------------------------|
| 0.1     | 2026-04-xx | Kader     | Initial outline                                                                                 |
| 1.0     | 2026-05-17 | Kader     | Baseline aligned with SRS v1.0 and Production Roadmap                                           |
| 1.1     | 2026-05-17 | Kader     | Integrated Japan-inspired reference model; 4-layer architecture; +Modules 15–16; ADRs 011–016    |

This SDD translates the SRS into an implementable architecture. It is binding on Phase 1–2 and advisory for Phase 3+. Deviations require a documented Architecture Decision Record (ADR) in `/docs/adr/`.

---

## 1. Introduction

### 1.1 Purpose
Define the technical architecture of DANAYA: the components, their interfaces, the data they own, how they are deployed across four architectural layers, and how they sustain operation in low-connectivity environments without compromising data integrity, security, or patient continuity.

### 1.2 Scope
In scope: backend services, data stores, sync engine, frontend portals, integration surface (HL7 FHIR), deployment topology, cross-cutting concerns (security, observability, i18n), and Japan-inspired reference framing.
Out of scope: detailed security control catalog (→ Security Architecture Document), detailed schemas (→ Database Design Document), API endpoint contracts (→ API Specification), test strategy (→ Test Plan).

### 1.3 Architectural Drivers
Five non-negotiables, in priority order:

1. **Patient continuity across facilities** — a record must follow the patient, including across a referral from CSPS to CHR Dori.
2. **Offline-first at the edge** — a CSPS with one week of no internet still serves patients normally; reconciliation is deterministic on reconnect.
3. **Security & privacy by design** — zero-trust between services, encryption everywhere, full audit trail, patient-mediated consent.
4. **Open standards** — HL7 FHIR R4 for clinical exchange, OpenID Connect for identity, OpenTelemetry for observability. No vendor lock-in.
5. **Operability by Burkinabè teams** — every component is ops-able by a small team with limited bandwidth and intermittent power. Simple beats clever.

### 1.4 Design Philosophy (Monozukuri applied) + Japan Reference
- **Kaizen** — every module ships with metrics and a feedback hook; nothing is "done."
- **Wa (harmony)** — services are loosely coupled, never sharing databases; interface contracts are the only coupling.
- **Omotenashi** — UX in French + local languages, designed for the actual user (a midwife, not a developer).
- **Ganbaru** — graceful degradation, never silent failure. The system tells the user what it can and cannot do right now.

DANAYA additionally adopts a **Japan-Inspired Reference Model** (Section 2.4) drawing on Japan's health-system discipline — continuity of care, patient-held records, national standards, electronic prescription, and Medical DX — adapted to Burkina Faso's offline-first reality. The model is *reference, not template*: principles imported, implementations Burkinabè.

---

## 2. System Context

> **Analogy.** Picture Burkina Faso's health system as a postal network. The CSPS is the village post office, the CHR is the regional sorting center, and the Ministry is the national headquarters. The patient's pocket — the QR card and MCH passport — is the *carrier of last resort* when no road is open. DANAYA is the logistics network that guarantees every letter arrives, including by hand.

### 2.1 Four-layer architectural model

DANAYA is structured in four layers. **Layer 1 is the patient** — the foundation of continuity, not an afterthought. Layers 2–4 are infrastructure tiers that exist to serve Layer 1.

```
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 4 — NATIONAL HEALTH GOVERNANCE  (Tier 3)                         │
│  MoH dashboards  •  National Service Catalog  •  National MPI          │
│  Health ID Registry  •  FHIR Exchange Gateway  •  DHIS2 reporting      │
│  Identity Provider (Keycloak)                                          │
└─────────────────────────────────▲──────────────────────────────────────┘
                                  │  FHIR / mTLS (async batch + on-demand)
┌─────────────────────────────────┴──────────────────────────────────────┐
│ LAYER 3 — REGIONAL CONTINUITY  (Tier 2 — CHR Dori + 12 other CHRs)     │
│  Referral coordination  •  Telemedicine hub  •  Sync coordinator       │
│  Regional DB replica   •  Specialist review  •  Quality benchmarking   │
└─────────────────────────────────▲──────────────────────────────────────┘
                                  │  FHIR / mTLS (intermittent, queued)
┌─────────────────────────────────┴──────────────────────────────────────┐
│ LAYER 2 — FACILITY CARE DELIVERY  (Tier 1 — CSPS / CMA / hospital)     │
│  Patient Registry  •  MCH  •  Clinical Encounter  •  Lab  •  Pharmacy  │
│  Local Postgres  •  Local Redis  •  Offline-first Sync Agent  •  Audit │
│  Staff Portal (React)                                                  │
└─────────────────────────────────▲──────────────────────────────────────┘
                                  │  QR scan • Patient PWA • SMS • USSD
┌─────────────────────────────────┴──────────────────────────────────────┐
│ LAYER 1 — PATIENT-HELD CONTINUITY  (the patient's pocket)              │
│  DANAYA Health ID card (QR)  •  Digital MCH Passport (PWA / paper)     │
│  Allergies & current meds card  •  Consent assertions                  │
│  Emergency summary  •  SMS / USSD reminders                            │
└────────────────────────────────────────────────────────────────────────┘
```

**Why Layer 1 is a layer.** In Burkina Faso's connectivity reality, the patient physically carries data between facilities at a meaningful rate. A QR-printed Health ID resolves to the canonical `danaya_patient_id`; an MCH Passport printout (with signed QR) lets a CHR clinician reconstruct context when the network is unreachable. Layer 1 is a **legitimate data plane**, not just a UX surface.

**Tier autonomy principle.** Each tier (Layer 2/3/4) is autonomous: a facility keeps working if Layer 3 is unreachable; Layer 3 keeps working if Layer 4 is unreachable. Reconciliation is eventual and deterministic. Layer 1 makes care possible even when *all* upper layers are unreachable for the patient.

### 2.2 Note on CHR Dori
CHR Dori (established 1925, centenary in 2025) is a **regional hospital**, not a CSPS. In DANAYA's topology it serves as a **Layer 3 telemedicine hub** for the Sahel region — receiving teleconsultations from CSPS, coordinating referrals, and acting as the regional sync coordinator. Quality benchmarking flows downward from CHR Dori to surrounding facilities.

### 2.3 User groups
Per the SRS:
- **Patients & families** — Patient PWA (low-bandwidth), USSD fallback, paper MCH Passport with QR.
- **Healthcare workers** — Staff Portal (React), role-specialized views: midwife, doctor, nurse, pharmacist, lab tech, referral coordinator.
- **Ministry officials** — Analytics console at Layer 4.

### 2.4 Japan-Inspired Reference Model

DANAYA adopts six design pillars from Japan's health-system experience, each adapted to Burkina Faso. The model is reference, not transplant: Japan supplies the *principles*; DANAYA's implementation is Burkinabè.

| # | Pillar (Japan source)                          | DANAYA adaptation                                                                            |
|---|------------------------------------------------|----------------------------------------------------------------------------------------------|
| 1 | **My Number Health Card** (eligibility, identity) | **DANAYA Health ID** — QR-printed card, CNIB-linkable, offline-verifiable, MPI-anchored |
| 2 | **Maternal & Child Health Handbook**           | **Digital MCH Passport** — patient-held, paper + PWA, family-centered                        |
| 3 | **National Medical Fee Schedule**              | **National Service Catalog** — common service vocabulary; foundation for future claims        |
| 4 | **Electronic Prescription System**             | **Pharmacy Module** with medication history + duplicate/allergy alerts                        |
| 5 | **EMR Information Sharing (Medical DX)**       | **FHIR Referral Bundle** for patient summary exchange across CSPS → CMA → CHR → CHU          |
| 6 | **Kaizen quality culture**                     | **Facility Kaizen Dashboards** — continuous improvement KPIs at each facility                 |

> **Analogy.** Japan is the senior cousin who has lived in the same village for 40 years and knows where every road floods. DANAYA isn't building Japan's house; it's listening to the cousin and building its own house on Burkinabè ground, with rooms shaped for Burkinabè life.

The pillars map onto modules in Section 3 and onto specific architectural decisions (ADR-011 through ADR-016, Section 14).

---

## 3. Logical Architecture — Modules

DANAYA is a **modular monolith on day one, microservices by Phase 4**. Rationale: a small team in Phase 1–2 ships faster with a well-bounded monolith; module boundaries are enforced as if they were services (own schema, own API), so extraction later is mechanical, not surgical.

> **Analogy.** Think of it as a duplex house with internal walls already wired for separation. When the family grows, you cut the walls and you have two houses — no replumbing.

### 3.1 Module catalog (v1.1)

| #  | Module                       | Owns                                                       | Layer  | Phase | Japan pillar |
|----|------------------------------|------------------------------------------------------------|--------|-------|---------------|
| 1  | **Identity & Auth**          | Users, sessions, tokens, RBAC, MFA                         | 2,3,4  | 1     |               |
| 2  | **Patient Registry**         | Patient, demographics, household links, MPI submission     | 2,3,4  | 1     | P1            |
| 3  | **MCH Module**               | Pregnancy, ANCVisit, Delivery, Newborn, Vaccination        | 2,3    | 2     | P2            |
| 4  | **Clinical Encounter**       | Encounter, vitals, diagnosis (ICD-11)                      | 2,3    | 2     |               |
| 5  | **Pharmacy**                 | Prescription, dispensation, stock, allergy & duplicate check | 2,3  | 2     | P4            |
| 6  | **Laboratory**               | LabOrder, LabResult, specimen tracking                     | 2,3    | 2     |               |
| 7  | **Referral & Transfer**      | Referral, FHIR transfer bundle, transfer status            | 2,3,4  | 3     | P5            |
| 8  | **Patient Portal**           | Consent, record access, appointment requests               | 1,2,4  | 3     |               |
| 9  | **Telemedicine**             | TeleConsult session, store-and-forward case                | 2,3    | 5     |               |
| 10 | **Analytics**                | Aggregations, KPIs, MoH + Kaizen dashboards                | 3,4    | 4     | P6            |
| 11 | **Integration Gateway**      | FHIR R4 in/out, HL7 v2 adapters, DHIS2 connector, Service Catalog | 3,4 | 4   | P3, P5        |
| 12 | **Notification**             | SMS, email, USSD, push                                     | 2,3,4  | 2     |               |
| 13 | **Audit & Compliance**       | Immutable audit log, consent ledger                        | 2,3,4  | 1     |               |
| 14 | **Sync Engine**              | Outbox, inbox, CRDT/LWW reconciliation                     | 2,3,4  | 1     |               |
| 15 | **Health ID & Eligibility**  | DANAYA Health ID, QR card, CNIB linkage, offline token     | 2,3,4  | 1     | P1            |
| 16 | **Digital MCH Passport**     | Patient-held MCH companion view (PWA + printable), consent-scoped | 1,2 | 2     | P2            |

**Notes on design boundaries.**
- *Module 15 (Health ID)* is split from Patient Registry because identity issuance, QR signing, CNIB linkage, and offline verification deserve a dedicated owner with its own keys, lifecycle, and audit posture.
- *Module 16 (Digital MCH Passport)* is the patient-facing companion to Module 3 (MCH Module). Clinical truth lives in Module 3 at Layer 2; Module 16 derives a patient-held view at Layer 1 with consent-scoped access.
- *National Service Catalog* is **reference data** owned by the Integration Gateway (Module 11), not a separate module. It seeds future claims/billing without expanding v1 scope.
- *Claims/Billing* is **Phase 4+**, deliberately not v1. The Service Catalog and Encounter records make it possible later.
- *Kaizen Dashboards* are a **view family** of Module 10 (Analytics) with facility-level focus.

### 3.2 Module interaction map

```
┌─────────────────┐         ┌─────────────────┐         ┌──────────────────┐
│  Staff Portal   │         │  Patient PWA    │         │ Digital MCH      │
│      (React)    │         │      (React)    │         │ Passport (PWA)   │
└────────┬────────┘         └────────┬────────┘         └────────┬─────────┘
         │ HTTPS                     │ HTTPS                     │ HTTPS
         ▼                           ▼                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          API Gateway (Nginx)                           │
│           • TLS termination  • Rate limit  • Request routing           │
└────────┬───────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     AUTH MIDDLEWARE (JWT + RBAC)                       │
└────┬───────────────────────────────────────────────────────────┬───────┘
     │                                                           │
     ▼                                                           ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
│ Identity │ │ Patient  │ │Health ID │ │   MCH    │ │ Pharmacy │ │ Laboratory │
│  & Auth  │ │ Registry │ │  & Elig. │ │  Module  │ │  Module  │ │  Module    │
└────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘
     │            │            │            │            │             │
     │            │ events     │            │ events     │ events      │ events
     ▼            ▼            ▼            ▼            ▼             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                EVENT BUS  (Redis Streams in Phase 1)                   │
│   patient.created • health_id.issued • encounter.opened                │
│   lab.result.ready • mch.visit.recorded • referral.dispatched • ...    │
└────┬─────────────────────────────────────────────────────┬─────────────┘
     │                                                     │
     ▼                                                     ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
│Notification │ │Telemedi- │ │Referral &│ │  Audit   │ │   Sync     │
│  Service    │ │  cine    │ │ Transfer │ │   Log    │ │  Engine    │
└─────────────┘ └──────────┘ └────┬─────┘ └──────────┘ └─────┬──────┘
                                  │                          │
                                  ▼                          ▼
                            ┌──────────────────────────────────────┐
                            │  Integration Gateway (Layer 3/4)     │
                            │  FHIR exchange • Service Catalog •   │
                            │  DHIS2 connector                     │
                            └──────────────────────────────────────┘
```

**Coupling rules** (enforced by code review and ADR):
- A module reads and writes **only its own tables**.
- Cross-module reads happen via API call or domain event, not SQL joins across schemas.
- Synchronous calls are reserved for read paths the user is waiting on; everything else goes via the event bus.

---

## 4. Data Architecture

### 4.1 Data types managed

| Category              | Examples                                                                  |
|-----------------------|---------------------------------------------------------------------------|
| Identity              | User accounts, roles, sessions, MFA tokens                                |
| Health ID             | DANAYA Health ID, QR signing keys, CNIB linkage record                    |
| Demographic           | Patient, household, contact info, national ID linkage                     |
| Clinical structured   | Vitals, diagnosis codes (ICD-11), procedures, vaccinations                |
| Clinical narrative    | Encounter notes, consultation summaries                                   |
| MCH-specific          | Pregnancy, ANC visits, delivery, newborn, growth measurements             |
| MCH Passport view     | Patient-held summaries, derived from MCH Module + signed for offline use  |
| Pharmacy              | Prescriptions, dispensations, stock movements                             |
| Laboratory            | Orders, results, specimen tracking, reference ranges                      |
| Imaging / Telemed     | DICOM thumbnails + object-store pointers, teleconsult transcripts         |
| Referral              | Referral envelopes, transfer status, ambulance dispatch info              |
| Reference data        | National Service Catalog, ICD-11 cache, drug formulary                    |
| Operational           | Audit log, consent ledger, sync queues                                    |
| Analytics-derived     | Aggregates at Layer 4 (de-identified or k-anonymized) + Kaizen KPIs       |

### 4.2 Storage strategy per layer

| Layer | Primary store               | Cache  | Object store    | Notes                                  |
|-------|-----------------------------|--------|-----------------|----------------------------------------|
| 1     | Patient device / paper      | —      | —               | Signed QR + PWA local storage          |
| 2     | PostgreSQL 15 (single node) | Redis  | Local MinIO     | One Docker stack per facility           |
| 3     | PostgreSQL 15 (HA pair)     | Redis  | MinIO cluster   | Regional replica + telemed assets       |
| 4     | PostgreSQL 15 + warehouse   | Redis  | S3-compatible   | Aggregates only; raw PHI stays at L2/L3 |

**Data residency principle** — raw PHI lives at the layer where it was created. Layer 4 receives **derived, minimum-necessary** data. The Patient-Held Layer carries only **signed summaries** authorized by the patient. This is both a privacy principle and a bandwidth principle.

### 4.3 Indexing
- **Patient lookup**: composite index on `(national_id, dob)`, trigram index on `display_name` for fuzzy search at registration desks.
- **Health ID lookup**: unique index on `danaya_health_id`; secondary index on `(qr_signature_id)` for QR resolution.
- **Time-series clinical data** (vitals, lab results): BRIN indexes on `recorded_at`.
- **MCH timelines**: partial indexes on `(patient_id) WHERE pregnancy_active = true`.
- **Audit log**: append-only, partitioned monthly, indexed on `(actor_id, recorded_at)` and `(patient_id, recorded_at)`.

### 4.4 Encryption
- **At rest**: AES-256 via Postgres TDE-equivalent (pgcrypto for column-level on sensitive fields like national_id; full-disk LUKS on the host).
- **In transit**: TLS 1.3 everywhere, mTLS between layers.
- **Application-layer**: sensitive identifiers (national_id) encrypted with a key tier-rotated quarterly; clinical fields hashed-indexed where searchable.
- **QR signing** (Health ID, MCH summaries): Ed25519 signatures from a per-tier signing key; offline verifiers carry the public key bundle.
- **Backups**: encrypted with separate keys, stored off-host.

> **Analogy.** Four locks: the safe room (disk), the safe (DB), a personal lockbox (column-level), and a tamper-evident wax seal (signature on patient-held tokens). Even if three fail, the fourth holds.

### 4.5 Backup & retention
- **Layer 2**: hourly WAL ship to Layer 3, nightly full to Layer 3.
- **Layer 3**: nightly full to Layer 4 and to offline cold storage (encrypted external drive rotated weekly — pragmatic for connectivity reality).
- **Retention**: clinical records 30 years (per Burkinabè health archive law, to be verified during legal review); audit logs 10 years minimum; analytics aggregates indefinite.
- **Tested recovery**: quarterly restore drill, documented RTO ≤ 4 h, RPO ≤ 1 h for Layer 3, RPO ≤ 24 h for Layer 2.

### 4.6 Master Patient Index (MPI) + Health ID
A national MPI at Layer 4 deduplicates patients across facilities using a deterministic + probabilistic match:
- Deterministic: national ID (CNIB) if present; DANAYA Health ID always.
- Probabilistic: name + DOB + place of birth + phone, scored, manual review queue above 0.7 < score < 0.9.
- Each patient gets a stable `danaya_patient_id` (UUIDv7) and a human-readable `danaya_health_id` (typed-checkable, e.g. `BF-2026-XXXXXX-Y` with checksum) used in all cross-facility exchange and printed on the QR card.

---

## 5. Interface Design

### 5.1 Internal APIs
- REST + JSON, OpenAPI 3.1 contract-first.
- Versioned via URL prefix (`/api/v1/...`).
- Pagination: cursor-based for large lists.
- Idempotency: `Idempotency-Key` header required for all POST/PUT that create clinical artifacts — essential for offline retry.

### 5.2 External / inter-hospital APIs
- **HL7 FHIR R4** as the lingua franca. Resources used in v1: `Patient`, `Encounter`, `Observation`, `Condition`, `MedicationRequest`, `MedicationDispense`, `ServiceRequest`, `DiagnosticReport`, `Immunization`, `Procedure`, `DocumentReference`, `Consent`.
- Transport: HTTPS with mTLS between gateways.
- Authorization: SMART-on-FHIR with scoped tokens.
- Profile: a "DANAYA-BF" implementation guide will pin slicing and required extensions (e.g., national ID system OID, Health ID system OID, MCH-specific extensions).

### 5.3 Frontend interfaces (by user / department)

**Layer 1 (Patient-Held)**
- **Patient PWA**: own record summary, consent management, upcoming visits, vaccination calendar.
- **Digital MCH Passport (PWA)**: pregnancy timeline, ANC visit history, growth chart, vaccinations, danger-sign reminders. Offline-capable; signed snapshot on device.
- **Printed MCH Passport with QR**: paper companion for low-end phones / no-phone households.
- **SMS / USSD**: appointment reminders, vaccination reminders, danger-sign education.

**Layer 2 (Staff Portal)**
- **Reception**: patient search/register, Health ID issuance, demographic update, appointment book.
- **Midwife / MCH**: ANC visit form (digital MCH passport-aligned), partograph, risk flags.
- **Doctor**: encounter view (timeline), order entry (lab, pharmacy, imaging), referral form.
- **Nurse**: vitals capture, medication administration record (MAR), task list.
- **Pharmacist**: prescription queue, dispensation, duplicate-drug check, allergy check, stock view.
- **Lab tech**: order queue, result entry, validation, dispatch.
- **Referral coordinator**: referrals inbox/outbox, ambulance status, bed availability at receiving facility.
- **Facility admin**: user management, audit log explorer, facility config, **Kaizen dashboard** (Section 10).

**Layer 4 (Ministry)**
- **Analyst console**: KPI dashboards, district drill-down, national Kaizen indicators, export to DHIS2.

All forms are **offline-capable** at Layer 2: data is written locally first, queued for sync, and reflected in UI as "saved locally — sync pending."

### 5.4 Integration with existing tools
- **Lab analyzers**: HL7 v2.x ORM/ORU via a per-facility adapter when present; manual entry otherwise.
- **Pharmacy stock systems**: REST adapter or CSV import; reconciliation report flags drift.
- **DHIS2** (national HMIS): scheduled aggregate export from Layer 4 via DHIS2 Web API.
- **National CNIB registry**: read-only verification call from Health ID Module when online.
- **Future mobile**: same REST + FHIR APIs; mobile is a thin client over the same backend, no separate API surface.

### 5.5 Cross-department validation
- **Pharmacy ↔ Encounter**: a dispensation must reference an active `MedicationRequest`. Allergy alert checked against patient's `AllergyIntolerance`; duplicate-drug check against medication history.
- **Lab ↔ Encounter**: results auto-attach to the originating encounter; abnormal flags trigger notification to the ordering clinician.
- **MCH ↔ Patient Registry**: a pregnancy cannot be opened on a male-flagged patient without an explicit override + audit reason.
- **Referral ↔ Receiving facility**: referral cannot be marked "completed" until the receiving facility acknowledges arrival.
- **Health ID ↔ Patient Registry**: a Health ID is issued only against an existing Patient record; QR signature includes patient checksum to detect mismatches at scan time.

---

## 6. Inter-Hospital Patient Continuity (Japan Pillar 5)

The headline use case: a patient transferred from CSPS Gorom-Gorom to CHR Dori arrives with her record already present at CHR Dori.

### 6.1 Flow

```
   CSPS Gorom-Gorom (Layer 2)                       CHR Dori (Layer 3)
   ───────────────────────────                      ──────────────────────
   1. Clinician opens referral form
   2. System builds a FHIR Bundle:
      Patient + Encounter + Conditions
      + Observations + MedicationRequest
      + ServiceRequest (referral reason)
      + DocumentReference (notes)
   3. Bundle signed (JWS) + queued in Outbox
   4. Patient also receives a signed
      offline summary on her MCH Passport
                  │
                  │ Sync Agent (when network up)
                  ▼
            FHIR /Bundle$transaction over mTLS
                  │
                  ▼
                                              5. Gateway validates signature, profile
                                              6. MPI lookup (via Health ID) → match
                                              7. Bundle persisted, transaction id returned
                                              8. Referral Inbox notified, on-call doctor paged
                                              9. ACK sent back
                  ◄─────────────────────────────
   10. CSPS marks referral "received at CHR Dori"
   11. Ambulance dispatched if needed
```

If the network is down at step 4, the bundle stays in the Outbox; the clinician hands the patient a printed summary + QR code that CHR Dori scans to pull the bundle directly from the patient's signed offline envelope. **Two paths, same outcome.** This is Layer 1 acting as a data plane.

### 6.2 No data loss, no duplication
- Every bundle carries a `messageHeader.id` (UUIDv7); receivers de-duplicate on this id.
- MPI returns canonical `danaya_patient_id` via Health ID; the sending facility updates its local record to point to the canonical id on first successful match.
- Conflict policy: clinical entries are **never overwritten** across layers; conflicting updates produce a new version, both visible, flagged for clinician review.

---

## 7. Offline-First & Sync Architecture

### 7.1 Why this is the hard problem
Roughly a third of CSPS sites have unreliable internet; a non-trivial fraction have none on most days. Any design that assumes connectivity will fail in production and be quietly worked around with paper.

### 7.2 Core pattern — local-first with outbox/inbox
- Every write at Layer 2 commits to the local Postgres first.
- A domain event is written to an **Outbox** table in the same transaction (transactional outbox pattern — no lost events).
- A **Sync Agent** drains the Outbox to Layer 3 when connectivity returns, in order, with at-least-once delivery + idempotency keys.
- Layer 3 mirrors the inbound stream into an **Inbox** table before processing, providing replay and ordering.

### 7.3 Conflict resolution
- **Patient demographics**: last-writer-wins with a "layer priority" tiebreaker (higher layer wins on ties).
- **Clinical entries** (vitals, encounters, results): append-only — conflicts are impossible by design.
- **Mutable workflow state** (e.g., referral status): state-machine reconciliation; illegal transitions are rejected and surfaced to a human queue.
- **Pharmacy stock**: CRDT counter (positive-negative counter) — increments and decrements commute.

> **Analogy.** Three filing strategies: stamping new pages onto the file (clinical = append), keeping only the most recent stamp (demographics = LWW), and a tally counter that any clerk can bump in either direction (stock = CRDT). The right tool per data shape.

### 7.4 Sync transport
- Phase 1: HTTPS long-poll + chunked bundles. Simple, reliable.
- Phase 4+: optional MQTT broker at Layer 3 for push-style sync where bandwidth allows.
- All payloads gzip + zstd; budgeted to fit through a 2G fallback.

### 7.5 Time
Clocks drift on offline boxes. DANAYA uses **logical timestamps** (Hybrid Logical Clocks) on every record alongside wall-clock time. NTP at Layer 2 when online; otherwise periodic resync from Layer 3.

---

## 8. Security Architecture — Overview

A full security architecture document follows separately. The overview here:

### 8.1 Zero-trust posture
- No service trusts another by network position. Every internal call carries a service-to-service token.
- mTLS between services in production. Network policies (Cilium/NetworkPolicy) constrain who can talk to whom.

### 8.2 RBAC tiers (v1)

| Tier            | Roles                                                                          |
|-----------------|--------------------------------------------------------------------------------|
| Patient-facing  | `patient`, `patient_proxy` (family member with consent)                        |
| Clinical        | `midwife`, `nurse`, `doctor`, `specialist`, `lab_tech`, `pharmacist`            |
| Operations      | `referral_coordinator`, `reception_clerk`, `facility_admin`                    |
| Oversight       | `regional_admin`, `district_health_officer`, `ministry_analyst`                |
| System          | `service_account`, `auditor` (read-only on audit log only)                     |

Permissions are scoped by **(role, facility, patient-relationship)**: a midwife at CSPS A cannot read records at CSPS B unless an active referral or care relationship exists. ABAC overlays handle break-glass.

### 8.3 Authentication
- Staff: username + password + MFA (TOTP, fallback SMS). Password policy aligned with NIST 800-63B.
- Patients: Health ID + phone OTP, biometric on device if available.
- Service-to-service: short-lived signed JWTs from internal IdP, mTLS.
- Session: 30 min sliding for staff; 12 h for patients; immediate revocation on role change.

### 8.4 Audit & consent
- Every read and write of clinical data writes an audit entry: `(who, what, when, where, why, outcome)`.
- Audit log is **append-only** (Postgres + monthly hash-chain checkpoint stored at Layer 3 — tamper-evident).
- Consent is a first-class resource (`Consent` FHIR resource). Patient can grant, scope, time-bound, and revoke. Every cross-facility data exchange checks active consent (or recognized emergency override, which itself is consent-logged).

### 8.5 Compliance posture
- **Burkinabè law** — `Loi n°010-2004/AN sur la protection des données à caractère personnel` and applicable Ministry of Health directives. Formal mapping in the Security Architecture document.
- **Reference frameworks**: GDPR (data subject rights model), HIPAA (technical safeguards model), ISO/IEC 27001 (ISMS), ISO/IEC 27799 (health information specific). DANAYA conforms to the **superset** of applicable controls.
- **Digital Public Goods** standard — open license (Apache 2.0), open standards, data privacy by design — already targeted.

---

## 9. Scalability, Performance & Operability

### 9.1 Performance targets (v1)
- Patient lookup at facility (by Health ID QR scan): **p95 < 200 ms** offline.
- Patient lookup by name: **p95 < 300 ms** offline, **< 800 ms** online.
- Encounter save: **p95 < 500 ms** locally.
- Referral bundle delivery L2→L3: **p95 < 30 s** when connectivity available.
- Layer 4 KPI refresh: hourly batch.

### 9.2 Horizontal scaling — adding hospitals
A new facility means: provision a Docker stack, register the facility with Layer 3 IdP, run schema migration, run seed (admin user + facility config), connect Sync Agent. Target: **< 1 hour** from arrival of hardware to first patient registered. Onboarding playbook lives in `/docs/deployment/onboarding.md` (to be authored alongside the Deployment Guide).

### 9.3 Vertical scaling — data load growth
- Postgres partitioning on time-series tables (monthly).
- Read replicas at Layer 3 for analytics jobs.
- Cold storage tier for clinical archives > 5 years old (still queryable, slower).
- The Sync Engine is stateless and can run multiple workers in parallel keyed on facility id.

### 9.4 Infrastructure choice — hybrid by necessity
- **Layer 2**: on-premise mini-server (Intel NUC class or similar) with UPS. Solar-friendly. Docker Compose for v1, k3s for v2+.
- **Layer 3**: regional data center or hosted at the CHR; HA pair, redundant power, dual ISP if available.
- **Layer 4**: government cloud (preferred — data sovereignty) or hybrid with a sovereign region of a major cloud provider, with hard contractual data-residency.

> **Avoiding cloud-only.** The system runs end-to-end with Layer 4 completely offline. That is the correctness test for "is this design honest about Burkina Faso?"

### 9.5 Observability
- Metrics: Prometheus at each layer; federation to Layer 4.
- Logs: structured JSON, OpenTelemetry exporters, retained 90 days hot / 1 year cold.
- Traces: sampled in production, full on staging.
- Dashboards: Grafana, one "facility health" dashboard per facility, one "national pulse" at Layer 4.
- Alerts: paged on sync lag > 24 h, audit chain break, auth failure spikes, disk > 80 %.

---

## 10. Kaizen Quality Indicators (Japan Pillar 6)

Each facility runs a **Kaizen Dashboard** (a view family of Module 10 Analytics). The dashboard exposes the indicators below; trends are tracked weekly and reviewed in monthly improvement sessions.

| #  | Indicator                                    | Source module          | Target trend  |
|----|----------------------------------------------|------------------------|---------------|
| 1  | ANC completion rate (≥4 visits)              | MCH                    | ↑             |
| 2  | Vaccination on-time rate                     | MCH                    | ↑             |
| 3  | High-risk pregnancy follow-up rate           | MCH                    | ↑             |
| 4  | Referral completion time (dispatch → arrival)| Referral & Transfer    | ↓             |
| 5  | Lab result turnaround time                   | Laboratory             | ↓             |
| 6  | Prescription stockout days                   | Pharmacy               | ↓             |
| 7  | Sync delay (median, p95)                     | Sync Engine            | ↓             |
| 8  | Duplicate patient rate                       | Patient Registry / MPI | ↓             |
| 9  | Maternal / neonatal danger signs detected    | MCH                    | ↑ (detection) |
| 10 | Patient consent grants vs. declines          | Audit & Consent        | informational |

These same indicators feed the national Layer 4 console with aggregations by district and region — a Kaizen culture is local, but visible upward.

---

## 11. Cross-Cutting Concerns

| Concern              | Approach                                                                       |
|----------------------|--------------------------------------------------------------------------------|
| Internationalization | French (primary), Mooré, Dioula, Fulfulde for patient-facing UI; i18n keys in JSON; no concatenated strings. |
| Accessibility        | WCAG 2.1 AA target for web UIs; large-touch-target mode for older devices.     |
| Time zones           | All storage in UTC; display in `Africa/Ouagadougou`.                           |
| Units                | SI everywhere; legacy unit conversion at presentation layer only.              |
| Error handling       | User-facing errors in user language; technical detail in logs with correlation id; never expose stack traces. |
| Feature flags        | Per-facility flags via a config service; enables phased rollouts.              |
| Data quality         | Validation at form, at API, at DB constraint — three independent checks.       |

---

## 12. Recommended Tech Stack (confirmed)

| Layer              | Choice                                  | Why                                              |
|--------------------|-----------------------------------------|--------------------------------------------------|
| Backend language   | Python 3.11                             | Productive, strong FHIR/HL7 libraries, hire-able locally |
| API framework      | FastAPI                                 | Async, OpenAPI built-in, fast                    |
| Frontend           | React 18 + TypeScript + Vite            | Mature, PWA-friendly                              |
| Mobile (Phase 5)   | React Native (shared TS code) or PWA only | Reuse skills + components                       |
| RDBMS              | PostgreSQL 15                           | Reliable, JSONB, extensions (PostGIS, pgcrypto)  |
| Cache / event bus  | Redis 7 (Streams)                       | Single component, dual role at Layer 2           |
| Object storage     | MinIO (L2/L3), S3-compatible (L4)       | Same API everywhere                              |
| Container          | Docker / Docker Compose (v1) → k3s (v2) | Simple now, evolvable                            |
| Reverse proxy / TLS| Nginx + Let's Encrypt / internal CA     | Battle-tested                                    |
| FHIR libs          | `fhir.resources` (Python), `fhirclient` | Spec-aligned                                     |
| Auth               | OIDC via Keycloak (self-hosted)         | Open standard, sovereign                         |
| Observability      | Prometheus + Grafana + Loki + Tempo     | OSS, single-vendor-free                          |
| CI/CD              | GitHub Actions → Ansible to fleet       | Already in repo                                  |
| IaC                | Ansible (L2 fleet), Terraform (L3/L4)   | Right tool per layer                             |
| QR / signing       | Ed25519 (libsodium), qrcode library     | Compact, fast verify on low-end devices          |

---

## 13. v1 Module Function List (build target)

For the SRS-aligned v1 release (end of Phase 3), each module ships these functions:

**Identity & Auth**: register staff, login, MFA, password reset, role assignment, session management, service token issuance, audit hook.

**Patient Registry**: register patient, update demographics, search (exact + fuzzy), MPI submission, household link, consent capture, print patient card with QR.

**Health ID & Eligibility**: issue DANAYA Health ID at registration, generate signed QR card (printable), CNIB linkage when available, offline verification token, re-issue on loss, revocation on death/duplicate-resolution.

**MCH Module**: open pregnancy, schedule ANC, record ANC visit (digital MCH passport-aligned), partograph capture, register delivery, register newborn, vaccination schedule + capture, growth measurement, risk flag engine.

**Digital MCH Passport**: derive patient-held view from MCH Module data, render in PWA, print paper version with signed QR, push key updates via SMS, consent-scoped family access.

**Clinical Encounter**: open encounter, record vitals, record diagnosis (ICD-11 picker), free-text notes, attach documents, close encounter, encounter timeline view.

**Pharmacy**: receive prescription, allergy check, duplicate-drug check (medication history), dispense, partial dispense, stock view, stock movement entry, low-stock alert.

**Laboratory**: receive order, accept specimen, enter result, validate result, dispatch result to ordering clinician, abnormal flagging.

**Referral & Transfer**: create referral, build FHIR bundle, queue for sync, attach signed offline envelope to patient, track status, receive referral (Layer 3), ambulance request, acknowledge arrival, close referral loop.

**Patient Portal**: view own record, request access for proxy, grant/revoke consent, request appointment, receive notifications.

**Notification**: SMS send, email send, USSD send, push, template management, delivery receipts, MCH reminder scheduler.

**Audit & Compliance**: append entry, query by patient, query by actor, hash-chain checkpoint, export for inspection.

**Sync Engine**: drain outbox, deliver, ack, inbox replay, conflict detection, manual reconciliation queue, sync status dashboard.

**Telemedicine (Phase 5)**, **Analytics + Kaizen Dashboards (Phase 4)**, **Integration Gateway + Service Catalog (Phase 4)** — deferred but interface-stubbed in v1.

---

## 14. Architecture Decision Records (initial set)

To be filed in `/docs/adr/`:
- ADR-001: Modular monolith first, microservices later
- ADR-002: HL7 FHIR R4 as the exchange standard
- ADR-003: PostgreSQL at every layer (no NoSQL primary store)
- ADR-004: Transactional Outbox for sync
- ADR-005: HLC clocks for offline ordering
- ADR-006: Keycloak for identity, OIDC + SMART-on-FHIR
- ADR-007: Four-layer architecture with patient-held continuity
- ADR-008: Last-writer-wins + CRDT split per data shape
- ADR-009: French + 3 local languages from v1
- ADR-010: Apache 2.0 license, DPG-compliance target
- **ADR-011: Japan-inspired health system reference model** — adopt principles, not template
- **ADR-012: DANAYA Health ID + QR patient card** — Ed25519-signed, offline-verifiable
- **ADR-013: Digital MCH Passport** — patient-held, paper + PWA, derived from MCH Module
- **ADR-014: National Health Service Catalog** — reference data, owned by Integration Gateway; foundation for future claims
- **ADR-015: Electronic prescription & medication history** — duplicate-drug + allergy checks v1; cross-institution sharing v2
- **ADR-016: Kaizen dashboards** — view family of Analytics, facility-level + national rollup

---

## 15. Risks & Mitigations (top 10)

| #  | Risk                                                     | Likelihood | Impact | Mitigation                                                                   |
|----|----------------------------------------------------------|------------|--------|------------------------------------------------------------------------------|
| 1  | Connectivity worse than assumed at pilot CSPS            | High       | High   | Offline-first is core; Layer 1 patient-held envelopes; physical USB fallback |
| 2  | Power instability damages Layer 2 hardware               | High       | Med    | UPS mandatory; encrypted automated backups to Layer 3 hourly                 |
| 3  | Staff retention / turnover at facilities                 | High       | Med    | Train-the-trainer; role-based UIs minimize learning curve                    |
| 4  | National CNIB integration delayed                        | Med        | Med    | Health ID works without it; CNIB plugs in when ready                         |
| 5  | Schema drift between layers during upgrades              | Med        | High   | Versioned migrations, backwards-compat for N-1, gated rollout                |
| 6  | FHIR profile divergence over time                        | Med        | Med    | DANAYA-BF IG versioned and tested; CI runs FHIR validator                    |
| 7  | Insider threat                                           | Med        | High   | RBAC + ABAC + audit + break-glass + periodic access review                   |
| 8  | Data sovereignty challenge from a cloud vendor           | Low        | High   | Layer 4 hostable on-premise; portability is an explicit non-functional req   |
| 9  | Sync queue grows unbounded during long outage            | Med        | Med    | Backpressure, oldest-first delivery, on-disk queue with rotation             |
| 10 | Adoption stalls because UX doesn't fit clinician workflow| High       | High   | Field testing every sprint; clinician on the design team                     |

---

## 16. Phase-1 Build Order (next-90-days actionable)

1. **Identity & Auth** baseline (already in progress) → MFA + Keycloak migration.
2. **Patient Registry** with MPI stub.
3. **Health ID & Eligibility (Module 15)** — issuance, Ed25519 signing keys, QR generator, offline verification library.
4. **Audit log + hash chain** — must exist before any clinical data is captured.
5. **Sync Engine skeleton** — outbox + inbox tables, drain worker, idempotency.
6. **API Gateway + RBAC middleware** hardened.
7. **Facility provisioning playbook** — onboarding < 1 h target.
8. **Observability stack** at Layer 2 reference deployment.
9. **Layer 3 reference site** at CHR Dori — sync coordinator + FHIR gateway.
10. **MCH Module (Module 3) + Digital MCH Passport (Module 16)** scaffold — Phase 2 entry point.

This sequence builds the spine; modules hang off it in subsequent phases.

---

## 17. Glossary

- **ANC** — Antenatal Care
- **CSPS** — Centre de Santé et de Promotion Sociale (primary care facility)
- **CMA** — Centre Médical avec Antenne chirurgicale
- **CHR** — Centre Hospitalier Régional (regional hospital)
- **CHR Dori** — regional hospital in the Sahel region, est. 1925, DANAYA's Layer 3 telemedicine hub
- **CNIB** — Carte Nationale d'Identité Burkinabè
- **CRDT** — Conflict-free Replicated Data Type
- **DANAYA Health ID** — DANAYA's national patient identifier, QR-printable, offline-verifiable
- **DHIS2** — District Health Information System v2 (national HMIS)
- **FHIR** — Fast Healthcare Interoperability Resources (HL7 R4)
- **HLC** — Hybrid Logical Clock
- **MCH** — Maternal & Child Health
- **Medical DX** — Japan's Medical Digital Transformation initiative
- **MPI** — Master Patient Index
- **My Number Card** — Japan's national identity card, used as health insurance certificate
- **MoH** — Ministry of Health
- **PWA** — Progressive Web App
- **SDD** — System Design Document
- **SRS** — Software Requirements Specification
- **USSD** — Unstructured Supplementary Service Data (feature-phone interactive sessions)

---

## 18. Next Documents (immediate roadmap)

1. **Database Design Document** — concrete schemas per module (now 16), partitioning DDL, migration plan.
2. **API Specification** — OpenAPI 3.1 + DANAYA-BF FHIR Implementation Guide.
3. **Security Architecture** — full controls catalog (cryptography, key management, threat model, incident response, Health ID signing key lifecycle).
4. **Project Management Plan** — phase Gantt, RACI, governance.
5. **Test Plan** — unit / integration / contract / end-to-end / DR drill cadence.
6. **Deployment Guide** — facility onboarding, Layer 3/4 install, runbooks.

---

*« Danaya ka kɛnɛya. » — Trust brings health. Every architectural decision in this document is measured against that.*
