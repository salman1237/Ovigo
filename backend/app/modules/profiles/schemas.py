import uuid
from datetime import date, datetime
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


class ExpertUpcomingDeparture(BaseModel):
    departure_id: uuid.UUID
    tour_id: uuid.UUID
    tour_title: str
    departure_date: date
    return_date: date | None
    available_seats: int
    price: Decimal


class ExpertAssociatedGuide(BaseModel):
    guide_role_id: uuid.UUID
    name: str
    has_public_profile: bool  # links to /guides/{id}


class ExpertAssociatedProperty(BaseModel):
    property_id: uuid.UUID
    name: str
    property_type: str


class ExpertTransportService(BaseModel):
    mode: str
    provider_name: str | None
    vehicle_type: str | None


class PublicLocalExpertProfile(BaseModel):
    """PRD §8.2. Track-record numbers are computed (profiles/stats.py); None means
    there's nothing to measure yet, which the page shows as "new"."""

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
    # "verified" once Ovigo has verified the expert's ID document, else "pending".
    security_verification_status: str
    identity_verified: bool
    member_since: datetime | None  # when Ovigo approved the expert
    emergency_handling_capability: bool  # self-declared by the expert
    rating_avg: Decimal | None
    reviews_count: int
    rating_breakdown: dict[int, int]
    total_tours_conducted: int  # departures (and custom tours) with a completed booking
    completed_bookings: int
    response_rate_percent: int | None
    avg_response_minutes: int | None
    completion_rate_percent: int | None
    cancellation_rate_percent: int | None
    tours: list[TourSummary] = []
    upcoming_departures: list[ExpertUpcomingDeparture] = []
    guides: list[ExpertAssociatedGuide] = []
    properties: list[ExpertAssociatedProperty] = []
    transport: list[ExpertTransportService] = []


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
