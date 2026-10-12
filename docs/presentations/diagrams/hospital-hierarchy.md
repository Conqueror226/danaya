> Historical proposal/reference, not a description of the implemented Danaya 0.2 release. See the root README and current docs/ARCHITECTURE.md.

# Burkina Faso Healthcare Hierarchy

## 4-Tier System
```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: CHU (Centre Hospitalier Universitaire)                │
│  🏥🏥 2 Facilities | Ouagadougou, Bobo-Dioulasso                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  • Tertiary Care (Most Complex Cases)                           │
│  • Specialists (Cardiologists, Neurologists, etc.)              │
│  • Advanced Equipment (MRI, CT Scan, ICU)                       │
│  • Teaching & Research                                          │
│  • Receives Referrals from ALL Lower Levels                     │
│                                                                  │
│  Color Code: 🔵 BLUE                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │ Referral Up ⬆️
                         │ Feedback Down ⬇️
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2: CHR (Centre Hospitalier Régional)                     │
│  🏥🏥🏥 5+ Facilities | Regional Capitals                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  • Secondary Care                                               │
│  • General Surgery, Internal Medicine                           │
│  • Basic Imaging (X-Ray, Ultrasound)                           │
│  • Serves Multiple Districts                                    │
│  • Receives from CMA/CSPS, Refers to CHU                       │
│                                                                  │
│  Color Code: 🟢 GREEN                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │ Referral Up ⬆️
                         │ Feedback Down ⬇️
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: CMA (Centre Médical avec Antenne Chirurgicale)        │
│  🏥��🏥🏥 20+ Facilities | District Level                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  • Advanced Primary Care                                        │
│  • Minor Surgery                                                │
│  • Maternity Services                                           │
│  • Laboratory Services                                          │
│  • Receives from CSPS, Refers to CHR                           │
│                                                                  │
│  Color Code: 🟡 YELLOW                                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ Referral Up ⬆️
                         │ Feedback Down ⬇️
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 4: CSPS (Centre de Santé et de Promotion Sociale)        │
│  🏥🏥��🏥🏥 150+ Facilities | Village/Community Level            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  • Primary Care                                                 │
│  • Vaccinations, Basic Treatment                               │
│  • Prenatal Care                                                │
│  • Health Promotion                                             │
│  • First Contact, Refers Complex Cases Up                      │
│                                                                  │
│  Color Code: 🔵 TEAL                                            │
└─────────────────────────────────────────────────────────────────┘

TOTAL: 180+ Facilities Across 13 Regions
```

## Patient Journey Example
```
CASE: Awa, 28 years old, Pregnant, Complications

STEP 1: CSPS (Village - Dori)
┌────────────────────────────────────────┐
│ 🏥 CSPS Dori                           │
│ 👩‍⚕️ Nurse Examines Awa                 │
│ ⚠️  High Blood Pressure Detected       │
│ 📋 Decision: Refer to CHR              │
│ 📱 DANAYA: Create Referral             │
│    - Send Medical History              │
│    - Notify CHR                        │
└────────────────────────────────────────┘
            │
            │ 🚑 150km Ambulance
            │ �� Medical Record Transmitted via DANAYA
            ▼
STEP 2: CHR (Regional - Ouahigouya)
┌────────────────────────────────────────┐
│ 🏥 CHR Ouahigouya                      │
│ 👨‍⚕️ Doctor Reviews DANAYA Record        │
│    ✅ Already Has Full History         │
│ 🔬 Ultrasound Shows Complication       │
│ 📋 Decision: Emergency Transfer to CHU │
│ 📱 DANAYA: Notify CHU, Send Data       │
└────────────────────────────────────────┘
            │
            │ 🚁 Air Ambulance (Critical)
            │ 📱 CHU Prepared, ICU Ready
            ▼
STEP 3: CHU (Tertiary - Ouagadougou)
┌────────────────────────────────────────┐
│ 🏥 CHU Yalgado Ouédraogo              │
│ 👨‍⚕️ Specialist Waiting                 │
│    ✅ Full History from CSPS + CHR     │
│ 🏥 Emergency C-Section                 │
│ ✅ Mother & Baby Saved                 │
│ 📱 DANAYA: Update All Records          │
│    - Notify CSPS (Outcome)             │
│    - Learning for Future Cases         │
└────────────────────────────────────────┘

WITHOUT DANAYA:                WITH DANAYA:
❌ Paper records lost          ✅ Digital records follow patient
❌ Repeat tests (costly)       ✅ All history available
❌ Delays in treatment         ✅ CHU prepared in advance
❌ No feedback to CSPS         ✅ Knowledge shared back
⚠️  Lives at Risk              ✅ Lives Saved
```

## Data Flow in DANAYA
```
┌─────────────────────────────────────────────────────────────────┐
│                    HOSPITAL-AWARE DATA ISOLATION                 │
└─────────────────────────────────────────────────────────────────┘

CHU Yalgado (BF-CHU-YALG):
┌─────────────────────────┐
│ 👨‍⚕️ Dr. Ouedraogo        │
│ ├─ Can See: All Patients│
│ │  in CHU Yalgado       │
│ ├─ Can See: Referrals   │
│ │  FROM other hospitals │
│ └─ Cannot See: Other    │
│    CHU's Internal Data  │
└─────────────────────────┘

CHU Bobo (BF-CHU-BOBO):
┌─────────────────────────┐
│ 👨‍⚕️ Dr. Traore          │
│ ├─ Can See: All Patients│
│ │  in CHU Bobo          │
│ ├─ Can See: Referrals   │
│ │  FROM other hospitals │
│ └─ Cannot See: CHU      │
│    Yalgado's Data       │
└─────────────────────────┘

CSPS Dori (BF-CSPS-DOR-01):
┌─────────────────────────┐
│ 👩‍⚕️ Nurse Fatou          │
│ ├─ Can See: CSPS Dori   │
│ │  Patients Only        │
│ ├─ Can CREATE: Referrals│
│ ├─ Can RECEIVE: Feedback│
│ │  on Her Referrals     │
│ └─ Cannot See: Other    │
│    Facilities' Data     │
└─────────────────────────┘

SECURITY: Each Hospital = Separate Data Bucket
SHARING: Only via Explicit Referrals (Secure Transfer)
```
