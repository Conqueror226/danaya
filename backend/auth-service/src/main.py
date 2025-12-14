"""
DANAYA Authentication Service

Copyright (c) 2025 Kader BONZI
Licensed under the Apache License, Version 2.0
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt
import hashlib
import os
import logging
import httpx

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-CHANGE-IN-PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="DANAYA Auth Service",
    description="Zero-trust authentication. Danaya (Dioula) = Trust.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

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

class Hospital(BaseModel):
    id: str
    name: str
    short_code: str
    type: str
    level: str
    region_name: str
    city: str
    logo_url: str
    logo_color: str

class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: User
    hospital: Optional[Hospital] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# Demo users - now with proper hospital IDs matching registry
fake_users_db = {
    "doctor@chu-ouaga.bf": {
        "user_id": "USR001",
        "email": "doctor@chu-ouaga.bf",
        "full_name": "Dr. Ouedraogo Amadou",
        "role": "doctor",
        "hospital_id": "BF-CHU-YALG",  # CHU Yalgado
        "department": "Emergency",
        "hashed_password": hash_password("Doctor123!"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    "nurse@chu-ouaga.bf": {
        "user_id": "USR002",
        "email": "nurse@chu-ouaga.bf",
        "full_name": "Zongo Fatoumata",
        "role": "nurse",
        "hospital_id": "BF-CHU-YALG",  # CHU Yalgado
        "department": "Pediatrics",
        "hashed_password": hash_password("Nurse123!"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    "admin@danaya.bf": {
        "user_id": "USR003",
        "email": "admin@danaya.bf",
        "full_name": "Administrateur Système",
        "role": "admin",
        "hospital_id": "BF-CHU-YALG",  # CHU Yalgado for now
        "department": "IT",
        "hashed_password": hash_password("Admin123!"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    },
    "doctor@chu-bobo.bf": {
        "user_id": "USR004",
        "email": "doctor@chu-bobo.bf",
        "full_name": "Dr. Kone Seydou",
        "role": "doctor",
        "hospital_id": "BF-CHU-BOBO",  # CHU Bobo-Dioulasso
        "department": "Surgery",
        "hashed_password": hash_password("Doctor123!"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
}

async def get_hospital_info(hospital_id: str) -> Optional[Hospital]:
    """Fetch hospital information from registry service"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"http://localhost:8003/facilities/{hospital_id}",
                timeout=5.0
            )
            if response.status_code == 200:
                data = response.json()
                
                # Color mapping by type
                type_colors = {
                    "CHU": "#0047AB",
                    "CHR": "#00A651",
                    "CMA": "#FDB813",
                    "CSPS": "#20B2AA"
                }
                
                return Hospital(
                    id=data["id"],
                    name=data["name"],
                    short_code=data["short_code"],
                    type=data["type"],
                    level=data["level"],
                    region_name=data["region_name"],
                    city=data["city"],
                    logo_url=data["logo_url"],
                    logo_color=type_colors.get(data["type"], "#0047AB")
                )
    except Exception as e:
        logger.error(f"Failed to fetch hospital info for {hospital_id}: {e}")
    return None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
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
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.PyJWTError:
        raise credentials_exception
    
    user_dict = fake_users_db.get(email)
    if user_dict is None:
        raise credentials_exception
    return User(**user_dict)

@app.get("/")
async def root():
    return {
        "platform": "DANAYA",
        "service": "Authentication",
        "meaning": "Danaya (Dioula) = Trust",
        "motto": "Building trust through zero-trust security",
        "version": "0.1.0",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "danaya-auth",
        "version": "0.1.0",
        "users_registered": len(fake_users_db)
    }

@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info(f"Login attempt for: {form_data.username}")
    
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
            detail="Account is inactive"
        )
    
    # Fetch hospital information
    hospital = await get_hospital_info(user.hospital_id)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=access_token_expires
    )
    
    logger.info(f"✅ Token issued for user: {user.email} at {hospital.name if hospital else user.hospital_id}")
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=User(**user.dict()),
        hospital=hospital
    )

@app.post("/login", response_model=Token)
async def login_json(credentials: UserLogin):
    user = authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Fetch hospital information
    hospital = await get_hospital_info(user.hospital_id)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=User(**user.dict()),
        hospital=hospital
    )

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

if __name__ == "__main__":
    import uvicorn
    logger.info("=" * 70)
    logger.info("DANAYA Authentication Service Starting")
    logger.info("Danaya (Dioula) = Trust | Building trust through zero-trust")
    logger.info(f"Registered users: {len(fake_users_db)}")
    logger.info("Demo: doctor@chu-ouaga.bf / Doctor123!")
    logger.info("=" * 70)
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")
