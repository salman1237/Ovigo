import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.modules.guides.models import AssignmentStatus, GuideCertificationLevel, GuideProfileStatus, SupervisionStatus


class GuideInviteCreate(BaseModel):
    email: EmailStr


class PersonSummary(BaseModel):
    id: uuid.UUID  # partner_role_id
    full_name: str
    email: str | None


class SupervisionRead(BaseModel):
    id: uuid.UUID
    status: SupervisionStatus
    created_at: datetime
    responded_at: datetime | None
    expert: PersonSummary
    guide: PersonSummary
    guide_role_approved: bool


class SupervisionRespond(BaseModel):
    accept: bool


class AssignmentCreate(BaseModel):
    """The fee the expert pays the guide through Ovigo: one of the guide's packages
    (its current price, unless `fee_amount` overrides it) or a custom `fee_amount`.
    At least one is required; a fee of 0 means nothing is paid through Ovigo."""

    tour_departure_id: uuid.UUID
    package_id: uuid.UUID | None = None
    fee_amount: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class TourDepartureSummary(BaseModel):
    id: uuid.UUID
    departure_date: date
    tour_title: str


class PackageSummary(BaseModel):
    id: uuid.UUID
    name: str


class AssignmentRead(BaseModel):
    id: uuid.UUID
    status: AssignmentStatus
    fee_amount: Decimal | None
    package: PackageSummary | None = None
    checked_in_at: datetime | None
    checked_out_at: datetime | None
    created_at: datetime
    guide: PersonSummary
    departure: TourDepartureSummary


class AvailabilitySet(BaseModel):
    dates: list[date] = Field(min_length=1, max_length=90)
    is_available: bool


class AvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    is_available: bool


class GuideEarnings(BaseModel):
    total_completed_assignments: int
    total_fees: Decimal


class GuideCertificationRead(BaseModel):
    level: GuideCertificationLevel
    specialty: str | None
    is_restricted: bool
    restriction_reason: str | None


class GuideCertificationUpdate(BaseModel):
    level: GuideCertificationLevel
    specialty: str | None = None


class GuideRestrictionUpdate(BaseModel):
    is_restricted: bool
    restriction_reason: str | None = None


class GuideAdminSummary(BaseModel):
    role: PersonSummary
    role_status: str
    certification: GuideCertificationRead
    total_completed_assignments: int


# --- Guide services (Phase 9.3): public profile + priced packages ---


def _clean_languages(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    cleaned = []
    for language in value:
        language = language.strip()
        if language and language.lower() not in {c.lower() for c in cleaned}:
            cleaned.append(language[:40])
    return cleaned[:10]


class GuideProfileUpdate(BaseModel):
    headline: str | None = Field(default=None, max_length=255)
    bio: str | None = Field(default=None, max_length=5000)
    city: str | None = Field(default=None, max_length=120)
    languages: list[str] | None = None
    years_experience: int | None = Field(default=None, ge=0, le=80)

    _languages = field_validator("languages")(_clean_languages)


class GuideProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    guide_role_id: uuid.UUID
    headline: str | None
    bio: str | None
    city: str | None
    languages: list[str] | None
    years_experience: int | None
    status: GuideProfileStatus
    rejection_reason: str | None
    updated_at: datetime


class GuidePackageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    duration_hours: Decimal | None = Field(default=None, gt=0, le=24, max_digits=4, decimal_places=1)
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class GuidePackageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    duration_hours: Decimal | None = Field(default=None, gt=0, le=24, max_digits=4, decimal_places=1)
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    is_active: bool | None = None


class GuidePackageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    duration_hours: Decimal | None
    price: Decimal
    is_active: bool


class PublicGuideSummary(BaseModel):
    guide_role_id: uuid.UUID
    full_name: str
    headline: str | None
    city: str | None
    languages: list[str]
    years_experience: int | None
    certification_level: GuideCertificationLevel
    from_price: Decimal
    package_count: int


class PublicGuideDetail(PublicGuideSummary):
    bio: str | None
    completed_assignments: int
    packages: list[GuidePackageRead]


class GuideOpenDates(BaseModel):
    dates: list[date]


class AdminGuideProfileRead(BaseModel):
    guide: PersonSummary
    role_status: str
    profile: GuideProfileRead
    packages: list[GuidePackageRead]


class GuideProfileModeration(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class GuideBookingRead(BaseModel):
    """A traveler's booking of one of this guide's packages."""

    item_id: uuid.UUID
    booking_id: uuid.UUID
    service_date: date
    package_name: str
    price: Decimal
    booking_status: str
    item_status: str
    traveler_name: str
    traveler_email: str | None  # withheld once the booking is cancelled
