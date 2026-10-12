> Historical proposal/reference, not a description of the implemented Danaya 0.2 release. See the root README and current docs/ARCHITECTURE.md.

# Zero-Trust Security Architecture

## Traditional Security vs Zero-Trust
```
TRADITIONAL (Castle & Moat):               ZERO-TRUST (DANAYA):
┌────────────────────────┐                 ┌────────────────────────┐
│  Firewall (Hard Shell) │                 │  Verify Every Request  │
│  ┌──────────────────┐  │                 │  ┌──────────────────┐  │
│  │                  │  │                 │  │  �� JWT Check    │  │
│  │  Trusted Zone    │  │                 │  │  ✓ Role Check    │  │
│  │  (Everyone OK)   │  │                 │  │  ✓ Hospital ID   │  │
│  │                  │  │                 │  │  ✓ Permission    │  │
│  │  ❌ Once Inside  │  │                 │  │                  │  │
│  │     No Checks    │  │                 │  │  ✅ Every Time   │  │
│  └──────────────────┘  │                 │  └──────────────────┘  │
└────────────────────────┘                 └────────────────────────┘
     ⚠️ One Breach =                            ✅ Contained Damage
        Total Access                               Per Request
```

## DANAYA Zero-Trust Principles
```
┌─────────────────────────────────────────────────────────────┐
│  PRINCIPLE 1: Never Trust, Always Verify                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Login ──────▶ JWT Token (30min expiration)            │
│                     │                                        │
│                     ▼                                        │
│  Every Request ───▶ Validate Token                          │
│                     │                                        │
│                     ▼                                        │
│  Check Role ──────▶ Doctor? Nurse? Admin?                   │
│                     │                                        │
│                     ▼                                        │
│  Check Hospital ──▶ BF-CHU-YALG? BF-CHR-OUA?               │
│                     │                                        │
│                     ▼                                        │
│  Grant Access ────▶ Only to Allowed Resources              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PRINCIPLE 2: Least Privilege Access                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ��‍⚕️ Doctor:      ✅ All Permissions                         │
│  👩‍⚕️ Nurse:       ✅ Patient Care  ❌ Prescribe             │
│  💊 Pharmacist:  ✅ Prescriptions ❌ Patient Records         │
│  🧪 Lab Tech:    ✅ Lab Results   ❌ Prescriptions           │
│  👨‍💼 Admin:       ✅ All + System Settings                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PRINCIPLE 3: Micro-Segmentation                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Service 1 (Auth)  ──▶ Isolated Container                   │
│  Service 2 (Patient) ─▶ Isolated Container                  │
│  Service 3 (Registry)─▶ Isolated Container                  │
│                                                              │
│  Communication only through defined APIs                     │
│  Breach in one ≠ Access to all                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  PRINCIPLE 4: Continuous Monitoring                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Every Action Logged:                                       │
│  ┌────────────────────────────────────────────────┐        │
│  │ 2025-12-14 10:30:15 | doctor@chu-ouaga.bf      │        │
│  │ Action: View Patient P001                      │        │
│  │ Hospital: BF-CHU-YALG | IP: 192.168.1.10       │        │
│  │ Result: SUCCESS                                 │        │
│  └────────────────────────────────────────────────┘        │
│                                                              │
│  Immutable Audit Trail for Compliance                       │
└─────────────────────────────────────────────────────────────┘
```

## Adaptations for Burkina Faso
```
JAPANESE STANDARD:              DANAYA ADAPTATION:
┌────────────────────┐         ┌────────────────────┐
│ AES-256 Encryption │────▶    │ SHA-256 (Demo)     │
│ (Heavy)            │         │ (Lighter, Faster)  │
└────────────────────┘         └────────────────────┘

┌────────────────────┐         ┌────────────────────┐
│ Always Online      │────▶    │ Offline Mode       │
│ Required           │         │ (Cache + Sync)     │
└────────────────────┘         └────────────────────┘

┌────────────────────┐         ┌────────────────────┐
│ High Bandwidth     │────▶    │ Low Bandwidth      │
│ Assumed            │         │ Optimized (2G/3G)  │
└────────────────────┘         └────────────────────┘

Balance: Security ⚖️ Usability (Context Matters!)
```
