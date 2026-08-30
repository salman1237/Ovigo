import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.modules.guides.models import AssignmentStatus, SupervisionStatus


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
    tour_departure_id: uuid.UUID
    fee_amount: Decimal | None = Field(default=None, ge=0)


class TourDepartureSummary(BaseModel):
    id: uuid.UUID
    departure_date: date
    tour_title: str


class AssignmentRead(BaseModel):
    id: uuid.UUID
    status: AssignmentStatus
    fee_amount: Decimal | None
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
