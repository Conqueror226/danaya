# Danaya — La santé, en confiance

A French-first healthcare coordination platform for teams in Burkina Faso. Danaya brings patient registration, clinical observations, appointments, laboratory requests, prescriptions and inter-facility referrals into one role-aware workspace.

**Version 0.2 is a deployable technical pilot for evaluation with fictitious data. It is not a clinically validated national EMR or an approved service for real patient records.**

## Two ways to explore

- **Interactive demonstration:** the same responsive interface with clearly fictitious records. Browser-memory only; refreshing clears changes. No real clinical service is connected.
- **Full application:** React/Vite portal → same-origin Nginx gateway → FastAPI → PostgreSQL. Sessions, access controls, records, referrals and audit events persist on the server. Docker Compose supports a local installation and an HTTPS server installation.

The separate demonstration is built with `VITE_DEMO_MODE=true`. This flag is **never** enabled by the clinical Docker image. The professional deployment has no default account or password.

## What works

| Module | Implemented behavior |
| --- | --- |
| Public introduction | French landing page, care-team/service explanation, accessible professional entry |
| Authentication | Named accounts, salted scrypt password hashing, opaque server sessions, logout and account revocation |
| Patients | Search, pagination, registration, identity updates, per-facility national-ID duplicate checks |
| Appointments | Staff scheduling with explicit timezone, completion and cancellation |
| Clinical observations | Attributed, append-only notes; no overwriting signed-off observations |
| Laboratory | Clinician/nurse requests; laboratory staff record final free-text results |
| Pharmacy | Doctor prescriptions; pharmacist confirmation of dispensing |
| Referrals | Minimal identity snapshot, targeted clinical summary, documented sharing authorization; receiving doctor accepts or declines |
| Administration | Scoped audit history; command-line facility/account onboarding and password reset |
| Operations | Versioned migrations, health checks, production startup guards, HTTPS gateway configuration, backup script and CI |

These workflows do not perform diagnosis, dosage checking, medication interaction checking, stock management, appointment availability matching, transport booking or emergency triage. Referrals do not grant access to the source hospital's full record and do not merge patient identities.

## Quick start

Prerequisites: Git, Python 3, Docker Engine and the current Docker Compose plugin with `--wait` support.

```bash
git clone https://github.com/Conqueror226/danaya.git
cd danaya
bash scripts/setup-danaya.sh
```

Open **http://localhost:8080**. Setup generates a random local database password, builds the services and applies migrations. For an evaluation-only database:

```bash
docker compose exec api python -m app.manage seed-demo --confirm-fictional
```

Choose a password at the prompt. Sign in as `doctor@demo.danaya`, `nurse@demo.danaya`, `pharmacist@demo.danaya`, `lab_tech@demo.danaya` or `admin@demo.danaya`. `receiving@demo.danaya` is the receiving doctor at the second fictional facility. These accounts are created **only** by the explicit seed command, and seeding refuses a database that already has facilities.

For genuine facility/account configuration and HTTPS installation, follow [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md). Existing prototype data requires a separately reviewed migration; this release does not import old process-memory records automatically.

## Repository map

```text
backend/platform/
  app/                API, models, validation, authorization, administration
  migrations/         Reviewed Alembic revisions
  tests/              Access boundaries, workflows, persistence, migrations
frontend/staff-portal/
  src/                Public page, login, workspace, forms and shared components
  src/demo.js         Explicit demonstration adapter, never an authorization layer
  tests/              Demo-adapter regression tests
infra/Caddyfile        Optional HTTPS edge for a host with a domain
scripts/              Setup, lifecycle, read-only smoke check and database backup
.github/workflows/    API, PostgreSQL, portal and container verification
docs/                 Current architecture, review and future rollout requirements
```

The previous unused microservices and checked-in `node_modules` are removed from the active tree. Historical research/design documents are retained as proposals, with explicit notices; they are not implementation evidence.

## Development and checks

Python 3.12 and Node.js 22.12 or later are the tested runtime targets.

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/platform/requirements-dev.txt
cd backend/platform
python -m pytest -q
```

In a second terminal:

```bash
cd frontend/staff-portal
npm ci
npm test
npm run build
```

For local development without Docker, see the runbook. The frontend uses `/api` paths and cookies on the same origin; there are no browser-stored bearer tokens or patient records in localStorage. There is no service-worker cache of clinical information.

## Next rollout decisions

- [Architecture and national deployment path](docs/ARCHITECTURE.md)
- [Review findings, validation and remaining limitations](docs/RELEASE_REVIEW.md)
- [API contract](docs/API.md)
- [Security boundaries](SECURITY.md)

Internet-disconnected hospitals can run the full stack on a local server reachable over their LAN. **Browser-offline writes and synchronization between independent hospital servers are not implemented.** Inter-facility referral sharing in this release requires facilities on the same deployment.

No claim of GDPR, HIPAA or local health-data-law certification is made. Real deployment requires an identified operator, locally applicable legal review, clinical acceptance, access governance, monitored encrypted backups, recovery exercises and independent security/accessibility assessment.
