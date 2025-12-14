from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from uuid import uuid4

app = FastAPI(
    title="DANAYA Patient Service",
    description="Core EHR patient management microservice.",
    version="0.1.0",
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PatientBase(BaseModel):
    national_id: Optional[str] = Field(
        default=None,
        description="National health ID (NHID) or CNIB/Passport"
    )
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    sex: Optional[str] = Field(default=None, description="M, F, or O")
    date_of_birth: Optional[str] = Field(
        default=None,
        description="YYYY-MM-DD"
    )
    phone: Optional[str] = None
    address: Optional[str] = None
    region_id: Optional[str] = None
    hospital_id: Optional[str] = None

class PatientCreate(PatientBase):
    pass

class PatientUpdate(BaseModel):
    national_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    sex: Optional[str] = None
    date_of_birth: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    region_id: Optional[str] = None
    hospital_id: Optional[str] = None

class Patient(PatientBase):
    patient_id: str
    created_at: str
    updated_at: str

# Initialize with demo data
patients_db: dict[str, Patient] = {
    "P001": Patient(
        patient_id="P001",
        national_id="BF2025ABC12345",
        first_name="Awa",
        last_name="Zongo",
        sex="F",
        date_of_birth="1992-03-15",
        phone="+226 70 12 34 56",
        address="Quartier Gounghin, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2024-01-15T10:30:00Z",
        updated_at="2024-12-10T14:20:00Z"
    ),
    "P002": Patient(
        patient_id="P002",
        national_id="BF2025DEF67890",
        first_name="Salif",
        last_name="Ouedraogo",
        sex="M",
        date_of_birth="1978-07-22",
        phone="+226 76 55 44 33",
        address="Secteur 15, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2023-06-20T09:15:00Z",
        updated_at="2024-11-28T16:45:00Z"
    ),
    "P003": Patient(
        patient_id="P003",
        national_id="BF2025GHI11223",
        first_name="Mariam",
        last_name="Sawadogo",
        sex="F",
        date_of_birth="1995-11-08",
        phone="+226 72 88 99 00",
        address="Ouaga 2000",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2024-10-05T11:00:00Z",
        updated_at="2024-12-01T10:00:00Z"
    ),
    "P004": Patient(
        patient_id="P004",
        national_id="BF2025JKL44556",
        first_name="Ibrahim",
        last_name="Traore",
        sex="M",
        date_of_birth="1985-02-14",
        phone="+226 78 33 44 55",
        address="Tampui, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2024-08-12T14:30:00Z",
        updated_at="2024-12-08T09:20:00Z"
    ),
    "P005": Patient(
        patient_id="P005",
        national_id="BF2025MNO77889",
        first_name="Aminata",
        last_name="Kone",
        sex="F",
        date_of_birth="2000-09-30",
        phone="+226 70 99 88 77",
        address="Zone du Bois, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2024-11-20T08:45:00Z",
        updated_at="2024-12-11T13:15:00Z"
    ),
    "P006": Patient(
        patient_id="P006",
        national_id="BF2025PQR99001",
        first_name="Boureima",
        last_name="Kabore",
        sex="M",
        date_of_birth="1960-05-18",
        phone="+226 75 44 33 22",
        address="Pissy, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2022-03-10T13:20:00Z",
        updated_at="2024-12-09T11:30:00Z"
    ),
    "P007": Patient(
        patient_id="P007",
        national_id="BF2025STU22334",
        first_name="Fatou",
        last_name="Diallo",
        sex="F",
        date_of_birth="2010-12-25",
        phone="+226 71 22 33 44",
        address="Bogodogo, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2024-09-15T08:00:00Z",
        updated_at="2024-12-11T15:45:00Z"
    ),
    "P008": Patient(
        patient_id="P008",
        national_id="BF2025VWX55667",
        first_name="Moussa",
        last_name="Compaore",
        sex="M",
        date_of_birth="1988-08-03",
        phone="+226 77 88 99 00",
        address="Kossodo, Ouagadougou",
        region_id="Centre",
        hospital_id="CHU-Ouagadougou",
        created_at="2024-07-22T10:15:00Z",
        updated_at="2024-12-05T09:30:00Z"
    )
}

def generate_patient_id() -> str:
    return f"PAT-{uuid4().hex[:10].upper()}"

@app.get("/")
async def root():
    return {
        "service": "danaya-patient-service",
        "version": "0.1.0",
        "total_patients": len(patients_db),
        "docs": "/docs",
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "danaya-patient-service",
        "patients": len(patients_db),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }

@app.get("/patients", response_model=List[Patient])
async def list_patients(skip: int = 0, limit: int = 100, search: Optional[str] = None):
    """List patients with optional search"""
    patients = list(patients_db.values())
    
    # Search filter
    if search:
        search_lower = search.lower()
        patients = [
            p for p in patients
            if search_lower in p.first_name.lower()
            or search_lower in p.last_name.lower()
            or search_lower in (p.national_id or "").lower()
        ]
    
    return patients[skip:skip + limit]

@app.post("/patients", response_model=Patient, status_code=status.HTTP_201_CREATED)
async def create_patient(payload: PatientCreate):
    now = datetime.utcnow().isoformat() + "Z"
    patient_id = generate_patient_id()
    patient = Patient(
        patient_id=patient_id,
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )
    patients_db[patient_id] = patient
    print(f"✅ Created patient: {patient_id} - {patient.first_name} {patient.last_name}")
    return patient

@app.get("/patients/{patient_id}", response_model=Patient)
async def get_patient(patient_id: str):
    patient = patients_db.get(patient_id)
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found",
        )
    return patient

@app.put("/patients/{patient_id}", response_model=Patient)
async def update_patient(patient_id: str, payload: PatientUpdate):
    stored = patients_db.get(patient_id)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found",
        )
    update_data = payload.model_dump(exclude_unset=True)
    updated_dict = stored.model_dump()
    updated_dict.update(update_data)
    updated_dict["updated_at"] = datetime.utcnow().isoformat() + "Z"
    updated_patient = Patient(**updated_dict)
    patients_db[patient_id] = updated_patient
    print(f"✅ Updated patient: {patient_id}")
    return updated_patient

@app.delete("/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_patient(patient_id: str):
    if patient_id not in patients_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found",
        )
    del patients_db[patient_id]
    print(f"⚠️  Deleted patient: {patient_id}")
    return None

if __name__ == "__main__":
    import uvicorn
    print("=" * 70)
    print("🏥 DANAYA Patient Service Starting")
    print(f"👥 Demo patients loaded: {len(patients_db)}")
    print("📡 Running on http://localhost:8002")
    print("=" * 70)
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
