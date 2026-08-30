import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LocalExpertProfileUpsert(BaseModel):
    headline: str | None = None
    bio: str | None = None
    years_experience: int | None = None
    languages: list[str] | None = None
    is_published: bool | None = None


class LocalExpertProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_role_id: uuid.UUID
    headline: str | None
    bio: str | None
    years_experience: int | None
    languages: list[str] | None
    is_published: bool
    created_at: datetime


class HostProfileUpsert(BaseModel):
    business_name: str | None = None
    bio: str | None = None
    is_published: bool | None = None


class HostProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_role_id: uuid.UUID
    business_name: str | None
    bio: str | None
    is_published: bool
    created_at: datetime
