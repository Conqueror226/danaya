> Historical proposal/reference, not a description of the implemented Danaya 0.2 release. See the root README and current docs/ARCHITECTURE.md.

# DANAYA System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                        USERS (Medical Staff)                     │
│  👨‍⚕️ Doctors  |  👩‍⚕️ Nurses  |  💊 Pharmacists  |  🧪 Lab Techs  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                            │
│                  French User Interface                           │
│          Hospital Logos | Role-Based Navigation                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  API GATEWAY (Nginx)                             │
│          Load Balancing | Reverse Proxy | SSL/TLS               │
└───────────────┬───────────────┬─────────────────┬───────────────┘
                │               │                 │
    ┌───────────▼──────┐  ┌────▼──────┐  ┌──────▼────────┐
    │  AUTH SERVICE    │  │  PATIENT  │  │   REGISTRY    │
    │                  │  │  SERVICE  │  │   SERVICE     │
    │  • JWT Auth      │  │           │  │               │
    │  • RBAC          │  │  • CRUD   │  │  • Hospital   │
    │  • Hospital      │  │  • Search │  │    Data       │
    │    Awareness     │  │  • NHID   │  │  • 15+ Sites  │
    │                  │  │           │  │  • 9 Regions  │
    │  Port: 8001      │  │ Port:8002 │  │  Port: 8003   │
    └──────────┬───────┘  └─────┬─────┘  └───────┬───────┘
               │                │                 │
               └────────────────┼─────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │    DATA LAYER          │
                    │                        │
                    │  ┌─────────────────┐  │
                    │  │  PostgreSQL     │  │
                    │  │  (Patient Data) │  │
                    │  └─────────────────┘  │
                    │                        │
                    │  ┌─────────────────┐  │
                    │  │  Redis Cache    │  │
                    │  │  (Sessions)     │  │
                    │  └─────────────────┘  │
                    └────────────────────────┘

DEPLOYMENT: Docker Compose (7 Containers)
SECURITY: Zero-Trust Architecture
NETWORK: Isolated Docker Network (danaya-network)
```
