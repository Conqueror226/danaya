import secrets
import os
import time
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession
from .db import Audit, Facility, LoginAttempt, Patient, Record, Session, Transfer, User, get_db
from .schemas import (AppointmentData, LabData, Login, NoteData, PatientEdit, PatientInput,
                      PrescriptionData, RecordChange, RecordInput, TransferChange, TransferInput)
from .security import APP_ORIGIN, SECURE_COOKIE, current_user, hash_password, require, token_hash, verify_password

if os.getenv("ENVIRONMENT") == "production":
    if not APP_ORIGIN.startswith("https://") or not SECURE_COOKIE:
        raise RuntimeError("Production requires an HTTPS APP_ORIGIN and COOKIE_SECURE=true")
    from .db import DATABASE_URL
    if not DATABASE_URL.startswith("postgresql"):
        raise RuntimeError("Production requires PostgreSQL")

app = FastAPI(title="Danaya • API pilote", version="0.2.0", docs_url=None, redoc_url=None, openapi_url=None)
DUMMY_HASH = hash_password(secrets.token_urlsafe(32))
CREATE_ROLES = {"appointment": {"doctor", "nurse", "admin"}, "lab": {"doctor", "nurse"},
                "prescription": {"doctor"}, "note": {"doctor", "nurse"}}
READ_KINDS = {"doctor": {"appointment", "lab", "prescription", "note"},
              "nurse": {"appointment", "lab", "prescription", "note"},
              "pharmacist": {"prescription"}, "lab_tech": {"lab"}, "admin": {"appointment"}}
SCHEMAS = {"appointment": AppointmentData, "lab": LabData, "prescription": PrescriptionData, "note": NoteData}


def serialize(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


def audit(db, user, action, resource_id=""):
    db.add(Audit(user_id=user.id, facility_id=user.facility_id, action=action, resource_id=resource_id))


def patient_for(db, user, patient_id):
    patient = db.get(Patient, patient_id)
    if not patient or patient.facility_id != user.facility_id:
        raise HTTPException(404, "Dossier introuvable dans votre établissement.")
    return patient


def patient_view(patient, user):
    data = serialize(patient)
    if user.role in {"pharmacist", "lab_tech"}:
        data = {key: data[key] for key in ("id", "first_name", "last_name", "date_of_birth", "sex", "version")}
    return data


@app.middleware("http")
async def protect_request(request: Request, call_next):
    # Non-simple custom header + exact origin blocks cross-site mutations, including login CSRF.
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        if request.headers.get("origin") != APP_ORIGIN or request.headers.get("x-danaya-request") != "1":
            return JSONResponse({"detail": "Origine de la requête refusée."}, status_code=403, headers={"Cache-Control": "no-store"})
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/api/health")
def health(db: DBSession = Depends(get_db)):
    try:
        db.execute(text("SELECT 1 FROM users LIMIT 1"))
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return {"status": "ok", "version": "0.2.0"}


@app.post("/api/auth/login")
def login(payload: Login, response: Response, db: DBSession = Depends(get_db)):
    email = payload.email.strip().lower()
    key = token_hash(email)
    timestamp = int(time.time())
    db.execute(delete(LoginAttempt).where(LoginAttempt.at < timestamp - 900))
    count = db.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.key == key))
    if count >= 8:
        db.commit()
        raise HTTPException(429, "Trop de tentatives. Réessayez dans 15 minutes.")
    user = db.scalar(select(User).where(User.email == email))
    valid = verify_password(payload.password, user.password if user else DUMMY_HASH)
    if not user or not valid or not user.active:
        db.add(LoginAttempt(key=key, at=timestamp))
        db.commit()
        raise HTTPException(401, "Identifiants incorrects ou compte désactivé.")
    db.execute(delete(LoginAttempt).where(LoginAttempt.key == key))
    db.execute(delete(Session).where(Session.expires <= timestamp))
    token = secrets.token_urlsafe(48)
    db.add(Session(id=token_hash(token), user_id=user.id, expires=timestamp + 1800))
    audit(db, user, "session.login")
    db.commit()
    response.set_cookie("danaya_session", token, httponly=True, secure=SECURE_COOKIE, samesite="strict", max_age=1800, path="/api")
    return user_view(db, user)


def user_view(db, user):
    return {"id": user.id, "name": user.name, "role": user.role, "facility_id": user.facility_id,
            "facility": serialize(db.get(Facility, user.facility_id)), "session_seconds": 1800}


@app.get("/api/auth/me")
def me(request: Request, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return {**user_view(db, user), "session_seconds": max(0, request.state.session_expires - int(time.time()))}


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    db.execute(delete(Session).where(Session.id == token_hash(request.cookies.get("danaya_session", ""))))
    audit(db, user, "session.logout")
    db.commit()
    response.delete_cookie("danaya_session", path="/api", secure=SECURE_COOKIE, httponly=True, samesite="strict")


@app.get("/api/facilities")
def facilities(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    return [serialize(row) for row in db.scalars(select(Facility).order_by(Facility.name))]


@app.get("/api/patients")
def patients(q: str = Query("", max_length=100), offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
             user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    stmt = select(Patient).where(Patient.facility_id == user.facility_id)
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        stmt = stmt.where(or_(Patient.first_name.ilike(pattern, escape="\\"), Patient.last_name.ilike(pattern, escape="\\"), Patient.national_id.ilike(pattern, escape="\\")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Patient.last_name, Patient.id).offset(offset).limit(limit)).all()
    audit(db, user, "patient.list")
    db.commit()
    return {"items": [patient_view(row, user) for row in rows], "total": total}


@app.post("/api/patients", status_code=201)
def create_patient(payload: PatientInput, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, {"doctor", "nurse", "admin"})
    patient = Patient(facility_id=user.facility_id, **payload.model_dump(mode="json"))
    db.add(patient)
    try:
        db.flush()
        audit(db, user, "patient.create", patient.id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Cet identifiant existe déjà dans cet établissement.")
    return patient_view(patient, user)


@app.get("/api/patients/{patient_id}")
def patient_detail(patient_id: str, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    patient = patient_for(db, user, patient_id)
    audit(db, user, "patient.read", patient_id)
    db.commit()
    return patient_view(patient, user)


@app.put("/api/patients/{patient_id}")
def edit_patient(patient_id: str, payload: PatientEdit, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, {"doctor", "nurse", "admin"})
    patient_for(db, user, patient_id)
    values = payload.model_dump(mode="json", exclude={"version"})
    try:
        result = db.execute(update(Patient).where(Patient.id == patient_id, Patient.version == payload.version).values(**values, version=payload.version + 1))
        if not result.rowcount:
            raise HTTPException(409, "Dossier modifié par un collègue. Actualisez avant de réessayer.")
        audit(db, user, "patient.update", patient_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Cet identifiant existe déjà.")
    return patient_view(db.get(Patient, patient_id), user)


@app.get("/api/records")
def records(kind: str | None = None, patient_id: str | None = None, status: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=100),
            user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    allowed = READ_KINDS[user.role]
    if kind and kind not in allowed:
        raise HTTPException(403, "Accès refusé à ce type de dossier.")
    stmt = select(Record).where(Record.facility_id == user.facility_id, Record.kind.in_([kind] if kind else allowed))
    if patient_id:
        patient_for(db, user, patient_id)
        stmt = stmt.where(Record.patient_id == patient_id)
    if status:
        if status not in {"pending", "completed", "cancelled", "dispensed"}:
            raise HTTPException(422, "Statut invalide.")
        stmt = stmt.where(Record.status == status)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Record.created_at.desc(), Record.id).offset(offset).limit(limit)).all()
    audit(db, user, "record.list", patient_id or "")
    db.commit()
    names = {p.id: f"{p.first_name} {p.last_name}" for p in db.scalars(select(Patient).where(Patient.id.in_([r.patient_id for r in rows])))}
    return {"items": [{**serialize(row), "patient_name": names[row.patient_id]} for row in rows], "total": total}


@app.post("/api/records", status_code=201)
def create_record(payload: RecordInput, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, CREATE_ROLES[payload.kind])
    patient_for(db, user, payload.patient_id)
    try:
        data = SCHEMAS[payload.kind].model_validate(payload.data).model_dump(mode="json")
    except ValidationError:
        raise HTTPException(422, "Champs invalides. Vérifiez les informations et la date du rendez-vous.")
    row = Record(patient_id=payload.patient_id, facility_id=user.facility_id, kind=payload.kind,
                 data=data, author_id=user.id, status="completed" if payload.kind == "note" else "pending")
    db.add(row)
    db.flush()
    audit(db, user, f"{payload.kind}.create", row.id)
    db.commit()
    return serialize(row)


@app.patch("/api/records/{record_id}")
def change_record(record_id: str, payload: RecordChange, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    row = db.get(Record, record_id)
    if not row or row.facility_id != user.facility_id:
        raise HTTPException(404, "Élément introuvable.")
    transitions = {("appointment", "completed"): {"doctor", "nurse", "admin"},
                   ("appointment", "cancelled"): {"doctor", "nurse", "admin"},
                   ("lab", "completed"): {"lab_tech"}, ("lab", "cancelled"): {"doctor", "nurse"},
                   ("prescription", "dispensed"): {"pharmacist"}, ("prescription", "cancelled"): {"doctor"}}
    require(user, transitions.get((row.kind, payload.status), set()))
    if row.status != "pending":
        raise HTTPException(409, "Cet élément est déjà finalisé.")
    data = dict(row.data)
    if row.kind == "lab" and payload.status == "completed":
        if not payload.result:
            raise HTTPException(422, "Le résultat est requis.")
        data["result"] = payload.result
    elif payload.result is not None:
        raise HTTPException(422, "Ce type de modification n'accepte pas de résultat.")
    from .db import now
    data["completed_by"] = user.id
    data["completed_at"] = now()
    changed = db.execute(update(Record).where(Record.id == record_id, Record.version == payload.version, Record.status == "pending").values(data=data, status=payload.status, version=payload.version + 1))
    if not changed.rowcount:
        raise HTTPException(409, "Élément modifié. Actualisez la page.")
    audit(db, user, f"{row.kind}.{payload.status}", row.id)
    db.commit()
    return serialize(db.get(Record, record_id))


@app.get("/api/transfers")
def transfers(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, {"doctor", "nurse"})
    stmt = select(Transfer).where(or_(Transfer.source_id == user.facility_id, Transfer.destination_id == user.facility_id))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Transfer.created_at.desc(), Transfer.id).offset(offset).limit(limit)).all()
    audit(db, user, "transfer.list")
    db.commit()
    return {"items": [serialize(row) for row in rows], "total": total}


@app.post("/api/transfers", status_code=201)
def create_transfer(payload: TransferInput, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, {"doctor"})
    patient = patient_for(db, user, payload.patient_id)
    if payload.destination_id == user.facility_id or not db.get(Facility, payload.destination_id):
        raise HTTPException(422, "Choisissez un autre établissement enregistré.")
    snapshot = {key: getattr(patient, key) for key in ("first_name", "last_name", "date_of_birth", "sex")}
    row = Transfer(patient_id=patient.id, source_id=user.facility_id, destination_id=payload.destination_id,
                   summary=payload.summary, consent_note=payload.consent_note, author_id=user.id, patient_snapshot=snapshot)
    db.add(row)
    db.flush()
    audit(db, user, "transfer.create", row.id)
    db.commit()
    return serialize(row)


@app.patch("/api/transfers/{transfer_id}")
def change_transfer(transfer_id: str, payload: TransferChange, user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, {"doctor"})
    row = db.get(Transfer, transfer_id)
    if not row or user.facility_id not in {row.source_id, row.destination_id}:
        raise HTTPException(404, "Transfert introuvable.")
    expected_facility = row.source_id if payload.status == "cancelled" else row.destination_id
    if user.facility_id != expected_facility:
        raise HTTPException(403, "Cette action appartient à l'autre établissement.")
    changed = db.execute(update(Transfer).where(Transfer.id == transfer_id, Transfer.status == "pending", Transfer.version == payload.version).values(status=payload.status, version=payload.version + 1))
    if not changed.rowcount:
        raise HTTPException(409, "Transfert déjà traité. Actualisez la page.")
    audit(db, user, f"transfer.{payload.status}", transfer_id)
    db.commit()
    return serialize(db.get(Transfer, transfer_id))


@app.get("/api/audit")
def audit_log(offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    require(user, {"admin"})
    stmt = select(Audit).where(Audit.facility_id == user.facility_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Audit.at.desc(), Audit.id).offset(offset).limit(limit)).all()
    audit(db, user, "audit.read")
    db.commit()
    return {"items": [serialize(row) for row in rows], "total": total}


@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user), db: DBSession = Depends(get_db)):
    counts = dict(db.execute(select(Record.kind, func.count()).where(
        Record.facility_id == user.facility_id, Record.kind.in_(READ_KINDS[user.role]),
        Record.status == "pending").group_by(Record.kind)).all())
    transfer_count = None
    if user.role in {"doctor", "nurse"}:
        transfer_count = db.scalar(select(func.count()).select_from(Transfer).where(
            or_(Transfer.source_id == user.facility_id, Transfer.destination_id == user.facility_id),
            Transfer.status == "pending"))
    audit(db, user, "dashboard.read")
    db.commit()
    return {"pending": {kind: counts.get(kind, 0) for kind in READ_KINDS[user.role]},
            "transfers": transfer_count}
