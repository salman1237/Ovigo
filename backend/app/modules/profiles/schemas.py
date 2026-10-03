import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.tours.schemas import TourSummary


class ProfileReportCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)


class LocalExpertProfileUpsert(BaseModel):
    headline: str | None = None
    bio: str | None = None
    years_experience: int | None = None
    languages: list[str] | None = None
    is_published: bool | None = None
    primary_destination_id: uuid.UUID | None = None
    secondary_destinations: list[str] | None = None
    expertise_categories: list[str] | None = None
    emergency_handling_capability: bool | None = None
    emergency_contact_number: str | None = None
    badge_level: str | None = None


class LocalExpertProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_role_id: uuid.UUID
    headline: str | None
    bio: str | None
    years_experience: int | None
    languages: list[str] | None
    is_published: bool
    has_photo: bool
    primary_destination_id: uuid.UUID | None = None
    secondary_destinations: list[str] | None = None
    expertise_categories: list[str] | None = None
    security_verification_status: str = "verified"
    emergency_handling_capability: bool = True
    emergency_contact_number: str | None = None
    rating_avg: Decimal = Decimal("5.00")
    reviews_count: int = 0
    total_tours_conducted: int = 0
    response_rate_percent: int = 100
    completion_rate_percent: int = 100
    cancellation_rate_percent: int = 0
    badge_level: str = "Verified Expert"
    created_at: datetime


class PublicLocalExpertProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    partner_role_id: uuid.UUID
    name: str
    headline: str | None
    bio: str | None
    years_experience: int | None
    languages: list[str] | None
    has_photo: bool
    photo_url: str | None = None
    primary_destination: str | None = None
    secondary_destinations: list[str] = []
    expertise_categories: list[str] = []
    security_verification_status: str = "verified"
    emergency_handling_capability: bool = True
    rating_avg: Decimal = Decimal("5.00")
    reviews_count: int = 0
    total_tours_conducted: int = 0
    response_rate_percent: int = 100
    completion_rate_percent: int = 100
    cancellation_rate_percent: int = 0
    badge_level: str = "Verified Expert"
    tours: list[TourSummary] = []


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
    has_photo: bool
    created_at: datetime
