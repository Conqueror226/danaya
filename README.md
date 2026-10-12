# Danaya ka kɛnɛya — digital healthcare platform

**Status: research prototype / pre-production. Do not use with real patient data.**

Danaya is a Burkina Faso–focused digital healthcare platform. The existing repository includes a staff portal and services for authentication, patients, and a healthcare-facility registry. The longer-term vision includes appointments, teleconsultation, health education, patient workflows, and interoperable records. **Those ambitions are not claims of implemented or clinically validated functionality.**

## Product direction

The first public-facing release should emphasize: (1) clear multilingual healthcare information and service discovery; (2) verified facility details and contact methods; (3) accessible appointment *requests* with explicit confirmation by a healthcare provider; and (4) mobile-first navigation for low-bandwidth connections. The staff-facing patient-record and clinician workflows must stay behind authenticated, role-restricted services. Prioritize French and consider local-language support with vetted translations.

Recommended public navigation: **Accueil · Trouver un établissement · Services · Ressources santé · À propos · Contact**. Clearly mark unverified facilities and unavailable appointment/telemedicine functions; never fabricate clinicians, partnerships, emergency contacts, availability, or medical advice. A friendly, community-led visual style can be inspired by Contact'Elles without copying its branding or content.

## Architecture (current repo)

```text
Browser -> Nginx gateway (/api/auth, /api/patients, /api/registry)
         -> React staff portal
         -> Authentication service / Patient service / Facility registry
         -> PostgreSQL / Redis (internal dependencies)
```

## Local development setup

1. Install a recent Docker Engine and Docker Compose plugin.
2. Copy `.env.example` to `.env`. **Replace every placeholder** with cryptographically random, unique secrets. Ensure `DATABASE_URL` uses the same database username/password; URL-encode its password component when necessary. Never commit `.env`.
3. Inspect and validate the configuration with `docker compose config`; do not share its output because it resolves secrets.
4. Run `docker compose up --build` and inspect logs and health checks with `docker compose ps` and `docker compose logs --tail=100`.
5. Local reverse proxy: `http://localhost:8080`. Direct service ports, where provided, are bound to loopback only and are **for development**, not for production.

**Warning:** This runbook describes a local prototype. It is not a deployment certificate or proof that all containers build successfully; run smoke tests on your target environment.

## Production readiness gates

- [ ] Replace local Compose with a hardened environment-specific deployment; configure HTTPS/TLS with an approved domain and a trusted ingress, disable cleartext public access, validate HSTS only after TLS works.
- [ ] Confirm backend authentication, authorization, tenant isolation, audit logging, and least-privilege access for **every patient-data endpoint**; test IDOR and broken object-level authorization.
- [ ] Remove all development fixtures and demo credentials from production; rotate secrets exposed in repository history and store secrets in a managed vault.
- [ ] Validate data protection obligations and hosting arrangements with local legal/health stakeholders before processing identifiable medical information.
- [ ] Implement encrypted backups and restore tests, retention/deletion workflows, incident response, access reviews, and patient consent notices.
- [ ] Assess medical-safety risks, clinical oversight, verified provider onboarding, and telehealth consent before activating consultation or triage features.
- [ ] Implement CI security scans, dependency updates, container image scans, automated API tests, and external accessibility testing (WCAG 2.2 AA target).
- [ ] Test French localization, keyboard navigation, screen readers, low-bandwidth/mobile access, empty/error states, and form accessibility.
- [ ] Validate facility registry accuracy and provenance; the dataset should not imply endorsement or verified service availability.

## Security note

This project is **not yet approved for PHI/medical-record production use**. Public informational pages can be launched separately from sensitive clinical workflows once reviewed. Development Compose exposes a local-only HTTP endpoint by design; never expose it directly to the public internet.

## License

Check repository licensing and third-party assets before distribution and commercial reuse.
