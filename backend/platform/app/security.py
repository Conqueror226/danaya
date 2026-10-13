import hashlib
import hmac
import os
import secrets
import time
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session as DBSession
from .db import Session, User, get_db

ROLES = {"doctor", "nurse", "pharmacist", "lab_tech", "admin"}
SECURE_COOKIE = os.getenv("COOKIE_SECURE", "true").lower() == "true"
APP_ORIGIN = os.getenv("APP_ORIGIN", "http://localhost:8080").rstrip("/")


def hash_password(value):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(value.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(value, encoded):
    try:
        _, salt, digest = encoded.split("$")
        actual = hashlib.scrypt(value.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
        return hmac.compare_digest(actual.hex(), digest)
    except (ValueError, TypeError):
        return False


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def current_user(request: Request, db: DBSession = Depends(get_db)):
    token = request.cookies.get("danaya_session", "")
    session = db.get(Session, token_hash(token)) if token else None
    user = db.get(User, session.user_id) if session and session.expires > time.time() else None
    if not user or not user.active:
        raise HTTPException(401, "Session expirée. Veuillez vous reconnecter.")
    request.state.session_expires = session.expires
    return user


def require(user, roles):
    if user.role not in roles:
        raise HTTPException(403, "Votre rôle ne permet pas cette action.")
