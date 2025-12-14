"""
DANAYA Authentication & Registry Service

In Dioula, 'danaya' means trust - the foundation of healthcare.
This service provides:
- Authentication (JWT)
- National facility registry (hospitals_bf.json)

Copyright (c) 2025
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from jose import jwt
import hashlib
import os
import logging
import json
from pathlib import Path
from functools import lru_cache

# =========================
# CONFIG
# =========================

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-CHANGE-IN-PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

BASE_DIR = Path(__file__).resolve().parent.parent  # /backend/auth-service
REGISTRY_PATH = BASE_DIR.parent / "registry" / "hospitals_bf.json"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("danaya-auth-registry")

app = FastAPI(
    title="DANAYA Auth & Registry Service",
    description="Zero-trust authentication + National Facility Registry for Burkina Faso.",
    version="0.2.0",
    contact={
        "name": "DANAYA Platform",
        "url": "https://github.com/Conqueror226/danaya",
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# =========================
# SIMPLE PASSWORD HASHING (DEMO)
# =========================

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

# =========================
# USER MODELS
# =========================

class User(BaseModel):
    user_id: str
    email: EmailStr
    full_name: str
    role: str
    hospital_id: str
    department: Optional[str] = None
    is_active: bool = True
    created_at: str


class UserInDB(User):
    hashed_password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: User


class UserLogin(BaseModel):
    email: EmailStr
    password: str

# =========================
# FACILITY REGISTRY MODELS
# =========================

class Facility(BaseModel):
    id: str
    short_code: str
    name: str
    type: str                   # CHU, CHR, CMA, CSPS, etc.
    level: Optional[str] = None # primary / secondary / tertiary
    ownership: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    logo_url: Optional[str] = None
    capabilities: Optional[dict] = None
    status: Optional[str] = None


class Region(BaseModel):
    region_id: str
    name: str
    facilities: List[Facility]


class FacilityRegistry(BaseModel):
    country: str
    version: str
    regions: List[Region]

# =========================
# FAKE USERS DB (DEMO)
# =========================

fake_users_db = {
    "doctor@chu-ouaga.bf": {
        "user_id": "USR001",
        "email": "doctor@chu-ouaga.bf",
        "full_name": "Dr. Ouedraogo Amadou",
        "role": "doctor",
        "hospital_id": "BF-CHU-TENG",  # must match a facility id in hospitals_bf.json
        "department": "Emergency",
        "hashed_password": hash_password("Doctor123!"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
}

# =========================
# REGISTRY LOADING
# =========================

BASE_DIR = Path(__file__).resolve().parent.parent  # /backend/auth-service
REGISTRY_PATH = BASE_DIR.parent / "registry" / "hospitals_bf.json"


@lru_cache(maxsize=1)
def load_registry() -> FacilityRegistry:
    if not REGISTRY_PATH.exists():
        logger.error(f"Registry file not found at {REGISTRY_PATH}")
        raise RuntimeError("Hospital registry file missing")

    with REGISTRY_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return FacilityRegistry(**data)


def flatten_facilities(registry: FacilityRegistry) -> List[Facility]:
    facilities: List[Facility] = []
    for region in registry.regions:
        for fac in region.facilities:
            facilities.append(fac)
    return facilities


def get_facility_by_id(facility_id: str) -> Optional[Facility]:
    reg = load_registry()
    for region in reg.regions:
        for fac in region.facilities:
            if fac.id == facility_id:
                return fac
    return None

# =========================
# AUTH HELPERS
# =========================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_user(email: str, password: str) -> Optional[UserInDB]:
    user_dict = fake_users_db.get(email)
    if not user_dict:
        logger.warning(f"Login attempt for non-existent user: {email}")
        return None
    if not verify_password(password, user_dict["hashed_password"]):
        logger.warning(f"Failed login attempt for user: {email}")
        return None
    logger.info(f"Successful authentication for user: {email}")
    return UserInDB(**user_dict)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except Exception:
        raise credentials_exception

    user_dict = fake_users_db.get(email)
    if user_dict is None:
        raise credentials_exception
    return User(**user_dict)

# =========================
# ROOT & HEALTH
# =========================

@app.get("/")
async def root():
  registry = load_registry()
  return {
      "platform": "DANAYA",
      "service": "Authentication & Registry",
      "meaning": "Danaya (Dioula) = Trust",
      "motto": "Building trust through zero-trust security",
      "version": "0.2.0",
      "registry_country": registry.country,
      "registry_version": registry.version,
      "docs": "/docs"
  }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "danaya-auth-registry",
        "version": "0.2.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "motto": "Danaya ka kɛnɛya - Trust in health"
    }

# =========================
# AUTH ROUTES
# =========================

@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=access_token_expires,
    )

    logger.info(f"Token issued for user: {user.email}")

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=User(**user.dict()),
    )


@app.post("/login", response_model=Token)
async def login_json(credentials: UserLogin):
    user = authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=access_token_expires,
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=User(**user.dict()),
    )


@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# =========================
# REGISTRY ROUTES
# =========================

@app.get("/hospitals", response_model=List[Facility])
async def list_facilities(
    region_id: Optional[str] = None,
    facility_type: Optional[str] = None,
    level: Optional[str] = None,
    ownership: Optional[str] = None,
    search: Optional[str] = None,
):
    """
    List all public health facilities in Burkina Faso.
    Optional filters:
    - region_id
    - facility_type (CHU, CHR, CMA, CSPS, ...)
    - level (primary, secondary, tertiary)
    - ownership (public, private, faith-based)
    - search (name contains, case-insensitive)
    """
    registry = load_registry()
    facilities = flatten_facilities(registry)

    if region_id:
        region_ids = {r.region_id for r in registry.regions if r.region_id == region_id}
        facilities = [
            f
            for r in registry.regions
            if r.region_id in region_ids
            for f in r.facilities
        ]

    if facility_type:
        facilities = [f for f in facilities if f.type.lower() == facility_type.lower()]

    if level:
        facilities = [
            f for f in facilities
            if f.level and f.level.lower() == level.lower()
        ]

    if ownership:
        facilities = [
            f for f in facilities
            if f.ownership and f.ownership.lower() == ownership.lower()
        ]

    if search:
        s = search.lower()
        facilities = [
            f for f in facilities
            if s in f.name.lower() or (f.city and s in f.city.lower())
        ]

    return facilities


@app.get("/hospitals/regions", response_model=List[Region])
async def list_regions():
    """
    List regions with their facilities.
    """
    registry = load_registry()
    return registry.regions


@app.get("/hospitals/{facility_id}", response_model=Facility)
async def get_facility(facility_id: str):
    """
    Get a single facility by its ID (e.g., BF-CHU-TENG).
    """
    facility = get_facility_by_id(facility_id)
    if not facility:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Facility '{facility_id}' not found",
        )
    return facility

# =========================
# MAIN ENTRYPOINT
# =========================

if __name__ == "__main__":
    import uvicorn

    logger.info("=" * 60)
    logger.info("DANAYA Auth & Registry Service Starting")
    logger.info("Danaya (Dioula) = Trust")
    logger.info(f"Users in demo DB: {len(fake_users_db)}")
    logger.info(f"Registry path: {REGISTRY_PATH}")
    logger.info("=" * 60)

    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
