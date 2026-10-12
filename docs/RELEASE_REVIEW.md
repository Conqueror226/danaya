# Danaya 0.2 release review

Reviewed against the original prototype and the security/documentation baseline merged in PR #1. The workspace also contained an unfinished replacement API and portal; this release integrates and completes that work rather than discarding it.

## Findings and resolution

| Priority | Original finding | Release change |
| --- | --- | --- |
| Critical | Patient endpoints had no authentication or facility enforcement | All clinical routes require sessions and scope records to the account's facility |
| Critical | Patient/users stored in process-memory dictionaries | PostgreSQL-backed SQLAlchemy models; explicit migrations and persistent volumes |
| High | Known demo logins and fast unsalted password hashing | No automatic accounts; operator-created passwords with salted scrypt hashes |
| High | Deployment configuration referenced missing components and wrong internal endpoints | One clinical API, same-origin gateway, database, one-shot migrations and optional HTTPS edge |
| High | Concurrent edits could overwrite each other | Version-checked patient updates and clinical/referral transitions |
| High | Broad front-end claims exceeded implemented capability | Explicit pilot module/status matrix and a separate fictional demonstration |
| Medium | Patient selectors and clinical lists stopped at first page | Searchable paginated selectors, all queue pages and exact authorized dashboard counts |
| Medium | Successful write followed by a failed refresh could appear unsuccessful | Confirmed-save message and separate refresh-error handling |
| Medium | No schema upgrade or account recovery path | Versioned Alembic migrations and session-revoking password-reset/disable commands |
| Medium | Password normalization altered leading/trailing spaces | Credentials preserved exactly; email normalized separately |
| Medium | UI source minified into very long lines; stale alternatives and dependencies tracked | Formatted source, separate login/forms/components, removed obsolete services and tracked node_modules |
| Medium | CI masked test failures and referenced retired service paths | Failing API tests, PostgreSQL job, portal tests/builds and container gateway smoke job |

## Design direction

The interface is French-first, mobile-responsive, with a warm cream/green palette, large actions, clear departmental navigation and human-centered wording. It uses original CSS/vector composition and the project's Danaya name. No real clinician, customer, partnership, service availability or emergency contact was invented.

The supplied Facebook Contact'Elles page could not be retrieved. Search results were insufficient to establish its exact identity/design; no claim is made that this release matches that page pixel-for-pixel. Screenshots from the intended reference can support a later brand-specific refinement.

## Verification

Local checks performed on 2026-10-12 (workspace date):

- API/security/migration test suite: 17 passing tests, including hospital boundaries, unauthorized operations, role-limited reads/writes, consent requirement, duplicate/stale-version rejection, session expiry/revocation, laboratory workflow, large queues and repeatable schema upgrades.
- React component and demonstration tests: see current CI result and pull request; includes registration/edit/search/logout, pharmacy confirmation, later-page patient selection and two-facility referral demonstration.
- Production and demonstration builds: Vite static builds with the demo flag omitted/enabled respectively.
- Runtime dependency audit: all 20 pinned Python runtime packages checked; no known vulnerabilities reported at check time. Npm audit also reported none; this is a point-in-time advisory check, not a security certification.
- Shell syntax and Git whitespace checks completed.

Local limitations: Docker/PostgreSQL services and an approved interactive browser QA surface were not available in this workspace. Container and PostgreSQL checks are defined in GitHub CI; inspect their result before merging. Screen-reader, visual mobile-browser and end-user clinical acceptance testing remain outstanding. No actual healthcare server/domain has been provisioned by these code changes.

## Deliberate release limits

The platform remains a technical pilot. Before real patient use, prioritize:

1. Operator/governance and local legal review: data controller, hosting location, processing agreements, retention, access requests, consent/legal basis and incident procedures.
2. Independent security review, MFA/SSO, care-team restrictions, privileged access control, robust admission limits and tamper-evident audit archival.
3. Clinical validation: longitudinal encounters, allergies/medications, structured prescriptions/results, amendments and cancellation reasons, identity reconciliation and safe repeat-request handling.
4. Verified facility/provider onboarding, patient-facing service requests with actual provider confirmation, and governed clinical content if public services are added.
5. Recovery exercises, monitoring, encrypted backups, capacity tests, browser/accessibility testing and patient-data export/retention workflows.
6. Governed FHIR/legacy adapters and explicit outbox/inbox synchronization for independently deployed hospitals. Neither is implemented today.

Automatic patient matching, generalized idempotent creation, browser-offline writes, pharmacy inventory, image/document storage, teleconsultation and national-scale operation are not included. The application must not be marketed as providing these capabilities.
