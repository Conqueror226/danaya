from datetime import date, datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Login(StrictModel):
    # Passwords are opaque; normalization would break valid credentials.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class PatientInput(StrictModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    national_id: str | None = Field(default=None, max_length=80)
    date_of_birth: date | None = None
    sex: Literal["F", "M", "O", "U"] = "U"
    phone: str = Field(default="", max_length=40)
    address: str = Field(default="", max_length=300)

    @field_validator("date_of_birth")
    @classmethod
    def valid_birth(cls, value):
        if value and (value > date.today() or value.year < 1850):
            raise ValueError("Date de naissance invalide")
        return value

    @field_validator("national_id")
    @classmethod
    def normalized_id(cls, value):
        return value.upper() if value else None


class PatientEdit(PatientInput):
    version: int = Field(ge=1)


class AppointmentData(StrictModel):
    title: str = Field(min_length=2, max_length=160)
    scheduled_at: datetime
    service: str = Field(min_length=2, max_length=100)

    @field_validator("scheduled_at")
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("Fuseau horaire requis")
        if value < datetime.now(timezone.utc):
            raise ValueError("Choisir une date future")
        return value


class LabData(StrictModel):
    title: str = Field(min_length=2, max_length=160)
    notes: str = Field(default="", max_length=1000)


class PrescriptionData(StrictModel):
    title: str = Field(min_length=2, max_length=160)
    instructions: str = Field(min_length=2, max_length=2000)


class NoteData(StrictModel):
    title: str = Field(min_length=2, max_length=160)
    notes: str = Field(min_length=2, max_length=4000)


class RecordInput(StrictModel):
    patient_id: str
    kind: Literal["appointment", "lab", "prescription", "note"]
    data: dict


class RecordChange(StrictModel):
    version: int = Field(ge=1)
    status: Literal["completed", "cancelled", "dispensed"]
    result: str | None = Field(default=None, min_length=1, max_length=4000)


class TransferInput(StrictModel):
    patient_id: str
    destination_id: str
    summary: str = Field(min_length=10, max_length=4000)
    consent: Literal[True]
    consent_note: str = Field(min_length=10, max_length=1000)


class TransferChange(StrictModel):
    version: int = Field(ge=1)
    status: Literal["accepted", "declined", "cancelled"]
