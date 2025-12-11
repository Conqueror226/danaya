# DANAYA Threat Model

**Author:** Kader BONZI  
**Date:** December 2024  
**Version:** 0.1.0

## Overview

This document analyzes security threats to DANAYA using Microsoft's STRIDE methodology as part of the Master's thesis on zero-trust network architecture for healthcare systems.

**STRIDE Categories:**
- **S**poofing - Identity theft
- **T**ampering - Data modification
- **R**epudiation - Denying actions
- **I**nformation Disclosure - Data leaks
- **D**enial of Service - Availability attacks
- **E**levation of Privilege - Unauthorized access

---

## System Components
```
┌──────────────────────────────────────────────────────────┐
│              Internet (Untrusted Zone)                    │
└────────────────────┬─────────────────────────────────────┘
                     │
                ┌────▼────┐
                │   WAF   │ ← Web Application Firewall
                └────┬────┘
                     │
        ┌────────────▼────────────┐
        │    API Gateway           │
        │  (Authentication Point)  │
        └────────────┬────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌───▼────┐ ┌───▼────┐
    │  Auth   │ │  EHR   │ │  Lab   │
    │ Service │ │Service │ │Service │
    └─────────┘ └────────┘ └────────┘
         │           │           │
    ┌────▼───────────▼───────────▼────┐
    │     PostgreSQL Database           │
    └───────────────────────────────────┘
```

---

## Threat Analysis

### Component 1: Authentication Service

| Threat | Category | Likelihood | Impact | Mitigation | Status |
|--------|----------|------------|--------|------------|--------|
| Attacker brute forces login | Spoofing | High | Critical | Rate limiting (10 attempts/min) | 🚧 TODO |
| Stolen JWT token used | Spoofing | Medium | Critical | Short expiry (30min), refresh tokens | ✅ Implemented |
| Password database leaked | Info Disclosure | Low | Critical | Argon2 hashing, encrypted backups | ✅ Implemented |
| SQL injection in login | Tampering | Medium | Critical | Parameterized queries, ORM | ✅ Implemented |
| User denies accessing patient data | Repudiation | Medium | High | Immutable audit logs | 🚧 TODO |
| DDoS overwhelms auth endpoint | DoS | Medium | High | Rate limiting, CDN | 🚧 TODO |
| JWT secret key compromised | Elevation | Low | Critical | HSM key storage, rotation | 📋 Planned |

### Component 2: EHR Service

| Threat | Category | Likelihood | Impact | Mitigation | Status |
|--------|----------|------------|--------|------------|--------|
| Unauthorized patient record access | Info Disclosure | High | Critical | RBAC + zero-trust policies | 🚧 In Progress |
| Medical history modified maliciously | Tampering | Medium | Critical | Digital signatures, version control | 📋 Planned |
| Insider exports patient database | Info Disclosure | Medium | Critical | Data loss prevention, audit alerts | 📋 Planned |
| Ransomware encrypts EHR database | DoS | Low | Critical | Immutable backups, offline copies | 📋 Planned |

### Component 3: API Gateway

| Threat | Category | Likelihood | Impact | Mitigation | Status |
|--------|----------|------------|--------|------------|--------|
| Man-in-the-middle attack | Info Disclosure | Medium | Critical | TLS 1.3 mandatory, cert pinning | ✅ Implemented |
| API key leaked in logs | Info Disclosure | Medium | High | Sanitize logs, secure storage | 🚧 TODO |
| Excessive API calls | DoS | High | Medium | Rate limiting per IP/user | 🚧 TODO |

---

## Risk Matrix

| Risk Level | Count | Percentage | Priority |
|------------|-------|------------|----------|
| **Critical** | 8 | 42% | P0 - Immediate |
| **High** | 5 | 26% | P1 - This sprint |
| **Medium** | 4 | 21% | P2 - Next sprint |
| **Low** | 2 | 11% | P3 - Backlog |

---

## Attack Scenarios (Detailed)

### Scenario 1: Credential Stuffing Attack

**Attacker Goal:** Gain unauthorized access to doctor accounts

**Attack Steps:**
1. Attacker obtains leaked credentials from other breaches
2. Attempts login with 10,000 email/password pairs
3. Successfully logs in as Dr. Ouedraogo
4. Downloads patient records

**Current Defenses:**
- ❌ No rate limiting (vulnerable!)
- ✅ Argon2 password hashing (slows offline cracking)
- ❌ No account lockout (vulnerable!)

**Proposed Mitigations:**
- [ ] Implement rate limiting: 5 failed attempts → 15min lockout
- [ ] Add CAPTCHA after 3 failed attempts
- [ ] Alert admin on 10+ failed logins from single IP
- [ ] Require MFA for all clinical accounts

**Expected Outcome:** Block 99% of credential stuffing attempts

---

### Scenario 2: SQL Injection in Patient Search

**Attacker Goal:** Extract entire patient database

**Attack Steps:**
1. Attacker enters `' OR 1=1--` in patient search field
2. Vulnerable SQL: `SELECT * FROM patients WHERE name = '' OR 1=1--'`
3. Returns all patients in database
4. Attacker exports 50,000 patient records

**Current Defenses:**
- ✅ Using ORM (SQLAlchemy) with parameterized queries
- ✅ Input validation on API layer
- ❌ No Web Application Firewall (vulnerable!)

**Proposed Mitigations:**
- [x] Use parameterized queries (already implemented)
- [ ] Deploy ModSecurity WAF with OWASP Core Rule Set
- [ ] Add database-level access controls (least privilege)
- [ ] Monitor for unusual query patterns

**Expected Outcome:** Prevent SQL injection entirely

---

## Zero-Trust Implementation

### Micro-Segmentation Rules
```yaml
# Kubernetes NetworkPolicy Example
# Only auth-service can talk to postgres on port 5432

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: auth-service-db-access
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: auth-service
    ports:
    - protocol: TCP
      port: 5432
```

### Continuous Verification

- Every API request verified (no implicit trust)
- JWT tokens validated on each call
- User permissions checked against RBAC policies
- All database queries logged for audit

---

## Metrics & Monitoring

### Security KPIs

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Failed login rate | <1% | N/A | 🚧 Not tracked yet |
| Mean time to detect breach (MTTD) | <5 min | N/A | 📋 Monitoring needed |
| Mean time to respond (MTTR) | <30 min | N/A | 📋 Incident response plan needed |
| Patch deployment time | <24 hours | N/A | 📋 CI/CD needed |

---

## Recommendations

### Immediate (This Week)
1. **Rate Limiting**: Prevent brute force attacks
2. **Audit Logging**: Track all patient data access
3. **Input Validation**: Sanitize all user inputs

### Short-Term (This Month)
1. **WAF Deployment**: ModSecurity with OWASP rules
2. **MFA Implementation**: TOTP for all clinical staff
3. **Security Testing**: Automated SAST/DAST in CI/CD

### Long-Term (This Quarter)
1. **Zero-Trust Policies**: Kubernetes NetworkPolicies
2. **Blockchain Audit Trail**: Immutable access logs
3. **Penetration Testing**: External security audit

---

## References

- [OWASP Top 10 (2021)](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [STRIDE Threat Modeling](https://docs.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [Zero Trust Architecture (NIST SP 800-207)](https://csrc.nist.gov/publications/detail/sp/800-207/final)

---

**Next Steps:**
1. Implement high-priority mitigations
2. Conduct penetration testing
3. Document findings in thesis Chapter 4
