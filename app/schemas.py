import re
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

ALLOWED_TAGS = ("food", "medication", "measurement", "physical activity", "symptom")
ALLOWED_SHAPES = ("round", "oval", "capsule")
COLOR_RE = re.compile(r"^#[0-9a-f]{6}$")


def _clean_required(value: str, message: str, limit: int) -> str:
    value = value.strip()
    if not value:
        raise ValueError(message)
    if len(value) > limit:
        raise ValueError("That is too long")
    return value


def _clean_optional(value: str, limit: int) -> str:
    value = value.strip()
    if len(value) > limit:
        raise ValueError("That is too long")
    return value


class LogWrite(BaseModel):
    occurred_at: datetime
    text: str
    tags: list[str] = Field(min_length=1)

    @field_validator("occurred_at")
    @classmethod
    def clock_time(cls, value: datetime) -> datetime:
        if value.tzinfo is not None:
            value = value.replace(tzinfo=None)
        return value.replace(microsecond=0)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return _clean_required(value, "Write what happened", 4000)

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for tag in value:
            if tag not in ALLOWED_TAGS:
                raise ValueError("Unknown tag")
            if tag not in cleaned:
                cleaned.append(tag)
        if not cleaned:
            raise ValueError("Choose a tag")
        return cleaned


class PillWrite(BaseModel):
    name: str
    description: str = ""
    shape: str
    color: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_required(value, "Name the pill", 200)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        return _clean_optional(value, 4000)

    @field_validator("shape")
    @classmethod
    def clean_shape(cls, value: str) -> str:
        if value not in ALLOWED_SHAPES:
            raise ValueError("Choose a shape")
        return value

    @field_validator("color")
    @classmethod
    def clean_color(cls, value: str) -> str:
        value = value.strip().lower()
        if not COLOR_RE.fullmatch(value):
            raise ValueError("Choose a color")
        return value


class PillBoxCreate(BaseModel):
    title: str
    description: str = ""

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        return _clean_required(value, "Give the pill box a title", 200)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        return _clean_optional(value, 4000)


class PillBoxUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    end_date: date | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_required(value, "Give the pill box a title", 200)

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _clean_optional(value, 4000)


class SlotWrite(BaseModel):
    weekday: int = Field(ge=0, le=6)
    slot: int = Field(ge=0, le=8)
    pill_id: int | None = None


class CopyDay(BaseModel):
    weekday: int = Field(ge=0, le=6)


class VisitWrite(BaseModel):
    visit_date: date
    doctor_kind: str
    doctor_name: str
    conclusion: str = ""
    prescription: str = ""
    next_steps: str = ""

    @field_validator("doctor_kind")
    @classmethod
    def clean_kind(cls, value: str) -> str:
        return _clean_required(value, "Enter the kind of doctor", 200)

    @field_validator("doctor_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return _clean_required(value, "Enter the doctor's name", 200)

    @field_validator("conclusion", "prescription", "next_steps")
    @classmethod
    def clean_notes(cls, value: str) -> str:
        return _clean_optional(value, 8000)
