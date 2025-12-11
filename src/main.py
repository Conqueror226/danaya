"""
DANAYA Authentication Service

In Dioula, 'danaya' means trust - the foundation of healthcare.
This service builds that trust through zero-trust security principles.

Copyright (c) 2025 Kader BONZI
Licensed under the Apache License, Version 2.0
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta
from typing import Optional, List
import jwt
from passlib.context import CryptContext
import os
import logging

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-CHANGE-IN-PRODUCTION")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="DANAYA Auth Service",
    description="Zero-trust authentication for national healthcare platform. Danaya (Dioula) = Trust.",
    version="0.1.0",
    contact={
        "name": "Kader BONZI",
        "url": "https://github.com/Conqueror226/danaya",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Password hashing
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# ==================== MODELS ====================

class User(BaseModel):
    """User model (without password)"""
    user_id: str
    email: EmailStr
    full_name: str
    role: str = Field(..., description="doctor, nurse, pharmacist, lab_tech, admin")
    hospital_id: str
    department: Optional[str] = None
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserInDB(User):
    """User model with hashed password"""
    hashed_password: str

class Token(BaseModel):
    """Access token response"""
    access_token: str
    token_type: str
    expires_in: int
    user: User

class UserCreate(BaseModel):
    """User registration model"""
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: str
    role: str
    hospital_id: str
    department: Optional[str] = None

class UserLogin(BaseModel):
    """Login credentials"""
    email: EmailStr
    password: str

# ==================== FAKE DATABASE ====================
# In production, replace with PostgreSQL

fake_users_db = {
    "doctor@chu-ouaga.bf": UserInDB(
        user_id="USR001",
        email="doctor@chu-ouaga.bf",
        full_name="Dr. Ouedraogo Amadou",
        role="doctor",
        hospital_id="HOS001",
        department="Emergency",
        hashed_password=pwd_context.hash("Doctor123!"),
        is_active=True,
        created_at=datetime.utcnow()
    ).dict(),
    "nurse@chu-ouaga.bf": UserInDB(
        user_id="USR002",
        email="nurse@chu-ouaga.bf",
        full_name="Zongo Fatoumata",
        role="nurse",
        hospital_id="HOS001",
        department="Pediatrics",
        hashed_password=pwd_context.hash("Nurse123!"),
        is_active=True,
        created_at=datetime.utcnow()
    ).dict(),
}

# ==================== UTILITIES ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash password using Argon2"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "iss": "danaya-auth-service"
    })
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def authenticate_user(email: str, password: str) -> Optional[UserInDB]:
    """Authenticate user credentials"""
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
    """Get current user from JWT token"""
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
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise credentials_exception
    
    user_dict = fake_users_db.get(email)
    if user_dict is None:
        raise credentials_exception
    
    return User(**user_dict)

def check_role(user: User, allowed_roles: List[str]) -> bool:
    """Check if user has required role"""
    return user.role in allowed_roles

# ==================== ENDPOINTS ====================

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with platform info"""
    return {
        "platform": "DANAYA",
        "service": "Authentication",
        "meaning": "Danaya (Dioula) = Trust",
        "motto": "Building trust through zero-trust security",
        "version": "0.1.0",
        "docs": "/docs"
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "service": "danaya-auth",
        "version": "0.1.0",
        "timestamp": datetime.utcnow().isoformat(),
        "motto": "Danaya ka kɛnɛya - Trust in health"
    }

@app.post("/token", response_model=Token, tags=["Authentication"])
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    OAuth2 compatible login endpoint
    
    Returns JWT access token for authenticated users.
    
    **Test Credentials:**
    - Email: doctor@chu-ouaga.bf
    - Password: Doctor123!
    """
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
            detail="Account is inactive. Contact administrator."
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role, "hospital_id": user.hospital_id},
        expires_delta=access_token_expires
    )
    
    logger.info(f"Token issued for user: {user.email}")
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=User(**user.dict())
    )

@app.post("/login", response_model=Token, tags=["Authentication"])
async def login_json(credentials: UserLogin):
    """
    Alternative login endpoint accepting JSON
    
    Use this for frontend applications that send JSON instead of form data.
    """
    user = authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role},
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=User(**user.dict())
    )

@app.get("/users/me", response_model=User, tags=["Users"])
async def read_users_me(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user profile
    
    Requires valid JWT token in Authorization header.
    """
    return current_user

@app.post("/users/register", response_model=User, status_code=status.HTTP_201_CREATED, tags=["Users"])
async def register_user(
    user: UserCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Register new user (admin only)
    
    In production, this should be restricted to admin role.
    """
    # Check if admin (in production)
    if current_user.role not in ["admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can register new users"
        )
    
    if user.email in fake_users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Validate role
    valid_roles = ["doctor", "nurse", "pharmacist", "lab_tech", "admin"]
    if user.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}"
        )
    
    new_user = UserInDB(
        user_id=f"USR{len(fake_users_db) + 1:03d}",
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        hospital_id=user.hospital_id,
        department=user.department,
        hashed_password=get_password_hash(user.password),
        is_active=True,
        created_at=datetime.utcnow()
    )
    
    fake_users_db[user.email] = new_user.dict()
    logger.info(f"New user registered: {user.email} (role: {user.role})")
    
    return User(**new_user.dict())

@app.get("/users/list", response_model=List[User], tags=["Users"])
async def list_users(current_user: User = Depends(get_current_user)):
    """
    List all users (admin only)
    
    Returns list of all registered users without passwords
