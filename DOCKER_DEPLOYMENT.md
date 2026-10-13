# Danaya 0.2 deployment and operations

This is an executable deployment path for the technical pilot. Start with fictitious data. Acceptance for real healthcare use remains a separate operational and clinical decision.

## 1. Local evaluation

Use Python 3, Docker Engine and a current Docker Compose plugin. Run from the repository root:

```bash
bash scripts/setup-danaya.sh
docker compose ps
python3 scripts/smoke.py http://localhost:8080
```

The setup script creates `.env` only when missing and assigns mode 0600. A generated hexadecimal database password avoids URI escaping problems. No default user is created. The migration service applies the current schema before the API becomes ready. PostgreSQL and the API have **no host-published ports**. Nginx binds to `127.0.0.1:8080`.

If `.env` already exists from the old microservice prototype, compare it with the new `.env.example` first. The new database name is `danaya`, the user is `danaya`, and the Compose project is `danaya`. The previous PostgreSQL 15 volume must not be mounted into PostgreSQL 17: retain it, export it separately if needed, and test an explicit migration into a fresh database. Do not remove old volumes to make startup pass.

Create fictional evaluation accounts only in an empty deployment:

```bash
docker compose exec api python -m app.manage seed-demo --confirm-fictional
```

Choose a unique password of 14–256 characters. Demo account names are listed in the README. The seed creates no real facility affiliation, verified clinician, appointment capacity or patient.

## 2. Facility and staff administration

On a fresh database, register actual organizations only after operator verification:

```bash
docker compose exec api python -m app.manage add-facility facility-a 'Facility A' 'Ouagadougou'
docker compose exec api python -m app.manage add-user doctor@example.org 'Doctor Example' doctor facility-a
```

The command prompts for a password and confirmation; do not put passwords in shell arguments. Supported roles: `doctor`, `nurse`, `lab_tech`, `pharmacist`, `admin`. Each account belongs to one facility. Administrative staff cannot read clinical notes, laboratory results or prescriptions.

```bash
docker compose exec api python -m app.manage reset-password doctor@example.org
docker compose exec api python -m app.manage disable-user doctor@example.org
```

Both actions revoke existing sessions and write an audit entry. Disabled accounts remain disabled after password reset. Reactivation and role changes are intentionally not exposed as public self-service; review and implement the operator policy before providing them. There is no public account registration.

## 3. HTTPS on a server

Use a server with a stable domain, DNS pointing to it and ports 80/443 available. Restrict SSH to the operator network. Choose a lawful hosting location and encrypt the server's disks and backup storage.

Set these values in `.env`, keeping the existing generated database password:

```dotenv
APP_ORIGIN=https://health.example.org
DOMAIN=health.example.org
COOKIE_SECURE=true
ENVIRONMENT=production
```

`APP_ORIGIN` must be the exact browser origin without a path. Never use a wildcard or `COOKIE_SECURE=false` for an Internet deployment. The API refuses production startup without HTTPS, secure cookies and PostgreSQL. Caddy obtains and renews a certificate when public DNS and ACME connectivity are available.

```bash
docker compose --profile production up -d --build --wait
python3 scripts/smoke.py https://health.example.org
```

Only the HTTPS edge is publicly reachable; HTTP redirects to HTTPS. Do not publish the database/API ports or bypass the gateway. At larger scale, configure admission controls at the trusted edge: the current Nginx login throttle is a **shared pilot limit behind Caddy**, supplemented by per-account API throttling. It is not distributed DDoS protection.

The edge's certificate state is in persistent Caddy volumes. Internal application traffic is on the single-host Docker network; multi-host deployment needs separate network and transport security design. Cookie sessions last at most 30 minutes. MFA/SSO, inactivity locking and emergency-access governance remain pre-clinical requirements.

For a rural LAN, install the same stack locally. Use a locally trusted HTTPS certificate/domain for staff devices; distribute the CA through a managed process. The default localhost-only HTTP setup is for evaluation on one computer. Configure a reviewed LAN edge before allowing other devices to connect. Internet loss does not stop local server operations; losing access to that local server does.

## 4. Verify workflows before rollout

- Doctor: register a fictional patient, edit identity, create an observation, request a test and prescribe a fictional treatment.
- Laboratory staff: see only laboratory records, enter a result and verify it appears to the doctor.
- Pharmacist: see only prescriptions; confirm dispensing once.
- Administration: schedule/complete a visit, inspect scoped audit events; clinical record endpoints must return 403 when explicitly requested.
- Referring doctor: record a sharing authorization and send a summary to the other registered facility.
- Receiving doctor: view the summary and accept/decline. The source patient detail must still be inaccessible.
- Open two copies of an editable record. Save one, then the other: the second must return a conflict instead of silently overwriting.
- Stop/restart services and verify records remain. Test expired sessions, account disablement, tablet/mobile layouts and keyboard/screen-reader workflows.

A failed request after network loss may have reached the server. Do not blindly resubmit a registration/order: refresh and confirm the outcome first. The portal times out after 30 seconds, does not retry automatically, and blocks the open form’s submit button after an ambiguous response. Close the form, refresh the relevant list and reconcile before opening a new form. There is no general idempotent-write receipt or offline outbox in this release.

## 5. Backups and recovery

The named PostgreSQL volume is persistence, not backup. Configure a scheduler and a separate **encrypted** backup location outside the repository:

```bash
BACKUP_DIR=/secure-backups/danaya bash scripts/backup-danaya.sh
```

The script creates a restricted-permission PostgreSQL custom-format dump and writes to a temporary file until successful. It does **not** encrypt that dump itself. Require encrypted target storage and encrypted transport to the off-host copy. Define retention, monitor job failures, and protect encryption keys independently. The dump contains health information and must never be attached to issues or committed.

Perform recovery drills into a disposable database while the live system continues serving. Example, on a dedicated test deployment with no real data:

```bash
docker compose exec db createdb -U danaya danaya_restore_test
docker compose exec -T db pg_restore -U danaya -d danaya_restore_test --no-owner < /secure-backups/danaya/CHOSEN_BACKUP.dump
docker compose exec db psql -U danaya -d danaya_restore_test -c 'SELECT count(*) FROM patients;'
```

Use a newly created test database; never run these commands against the live database. Verify record counts, migrations, accounts, sampled clinical/referral integrity and application login using an isolated API pointed at the restored database. Securely remove the temporary restored copy after the drill. Define measured recovery point/time objectives with the operator before live use.

## 6. Updates and schema changes

Back up first. Review the change, run CI, and rehearse against a restored copy before updating a clinical deployment. Alembic migrations are stored in `backend/platform/migrations/versions`. `init-db` now means “upgrade to the reviewed migration head”; it is repeatable and does not seed data.

```bash
docker compose build
docker compose up -d --force-recreate migrate
docker compose up -d --wait api frontend
```

Apply incompatible migrations only during an approved maintenance window with the API stopped. Do not assume image rollback can undo a database migration. The initial downgrade destroys the pilot schema and is not an operational rollback procedure. Existing unmanaged tables created by an earlier unfinished build require a reviewed schema comparison; never blindly stamp them as migrated.

## 7. Local development without Docker

Use SQLite only for development/tests. From `backend/platform`, with the Python environment activated:

```bash
python -m app.manage init-db
python -m app.manage seed-demo --confirm-fictional
APP_ORIGIN=http://localhost:5173 COOKIE_SECURE=false uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Then in `frontend/staff-portal`:

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open exactly `http://localhost:5173`. Vite proxies `/api` to the backend. For a browser-only demo, use `VITE_DEMO_MODE=true npm run dev -- --host 127.0.0.1`; it does not call the backend.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Setup refuses to run | Docker/Compose installed; `.env` has a nonempty password; no old volume/image mismatch |
| API is unhealthy | Migration service completed; database reachable; production origin/cookie settings valid |
| Login or writes return 403 | Exact browser origin matches `APP_ORIGIN`; request reaches the same-origin gateway |
| Login succeeds but next request is 401 | Secure cookie over HTTPS; correct host; session not expired/disabled |
| Login returns 429 | Wait for the account's 15-minute window or the gateway admission limit; do not disable controls |
| Update returns 409 | Refresh the record and reconcile with the colleague's newer version |
| Referral is missing | Correct source/destination account; role is doctor or nurse; use pagination |

Use `docker compose logs --tail=100 api migrate` and `docker compose ps`. Do not share resolved Compose configuration or database dumps: they expose secrets or health data. The API disables access logs, and the gateway suppresses API URL logging.
