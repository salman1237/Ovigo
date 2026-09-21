import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.bidding.models import BidStatus, RequestStatus


class ItineraryDayIn(BaseModel):
    day_number: int
    title: str
    description: str | None = None


class CustomTourRequestCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10, max_length=4000)
    start_date: date
    end_date: date
    adults: int = Field(default=1, ge=1)
    children: int = Field(default=0, ge=0)
    infants: int = Field(default=0, ge=0)
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    location_id: uuid.UUID
    pickup_location: str | None = Field(default=None, max_length=255)
    food_preference: str | None = Field(default=None, max_length=2000)
    accessibility_needs: str | None = Field(default=None, max_length=2000)
    safety_privacy_notes: str | None = Field(default=None, max_length=2000)
    guide_requested: bool = False
    special_occasion: str | None = Field(default=None, max_length=255)
    additional_notes: str | None = Field(default=None, max_length=2000)
    bid_deadline: date | None = None

    @model_validator(mode="after")
    def check_dates_and_budget(self) -> "CustomTourRequestCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if self.budget_min is not None and self.budget_max is not None and self.budget_max < self.budget_min:
            raise ValueError("budget_max cannot be less than budget_min")
        if self.bid_deadline is not None and self.bid_deadline > self.start_date:
            raise ValueError("bid_deadline must be on or before start_date")
        return self


class CustomTourRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    start_date: date
    end_date: date
    group_size: int
    adults: int
    children: int
    infants: int
    budget_min: Decimal | None
    budget_max: Decimal | None
    pickup_location: str | None
    food_preference: str | None
    accessibility_needs: str | None
    safety_privacy_notes: str | None
    guide_requested: bool
    special_occasion: str | None
    additional_notes: str | None
    bid_deadline: date | None
    status: RequestStatus
    created_at: datetime
    bid_count: int = 0


class AddonIn(BaseModel):
    name: str
    price: Decimal


class BidCreate(BaseModel):
    price: Decimal = Field(gt=0)
    message: str | None = Field(default=None, max_length=2000)
    itinerary: list[ItineraryDayIn] = Field(default_factory=list, min_length=1)
    stay_name: str | None = Field(default=None, max_length=255)
    transport_details: str | None = Field(default=None, max_length=2000)
    food_menu: str | None = Field(default=None, max_length=2000)
    included_services: str | None = Field(default=None, max_length=2000)
    excluded_services: str | None = Field(default=None, max_length=2000)
    addons: list[AddonIn] = Field(default_factory=list)
    tax_amount: Decimal | None = None
    deposit_amount: Decimal | None = None
    cancellation_terms: str | None = Field(default=None, max_length=2000)
    valid_until: date | None = None


class BidUpdate(BaseModel):
    """A revision to a still-PENDING bid — the "Revision" step in the PRD flow. Every
    field optional so an expert can tweak just the price, just the itinerary, etc."""

    price: Decimal | None = Field(default=None, gt=0)
    message: str | None = Field(default=None, max_length=2000)
    itinerary: list[ItineraryDayIn] | None = None
    stay_name: str | None = Field(default=None, max_length=255)
    transport_details: str | None = Field(default=None, max_length=2000)
    food_menu: str | None = Field(default=None, max_length=2000)
    included_services: str | None = Field(default=None, max_length=2000)
    excluded_services: str | None = Field(default=None, max_length=2000)
    addons: list[AddonIn] | None = None
    tax_amount: Decimal | None = None
    deposit_amount: Decimal | None = None
    cancellation_terms: str | None = Field(default=None, max_length=2000)
    valid_until: date | None = None


class ExpertSummary(BaseModel):
    id: uuid.UUID  # partner_role_id, not user_id — the natural key on the expert side of a bid
    full_name: str


class BidRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    price: Decimal
    message: str | None
    itinerary: list[dict]
    stay_name: str | None
    transport_details: str | None
    food_menu: str | None
    included_services: str | None
    excluded_services: str | None
    addons: list[dict]
    tax_amount: Decimal | None
    deposit_amount: Decimal | None
    cancellation_terms: str | None
    valid_until: date | None
    is_shortlisted: bool
    status: BidStatus
    created_at: datetime
    expert: ExpertSummary


class BidWithBookingRead(BaseModel):
    bid: BidRead
    booking_id: uuid.UUID


class RequestQuestionCreate(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class RequestQuestionAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=2000)


class RequestQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    question: str
    answer: str | None
    answered_at: datetime | None
    created_at: datetime
    expert: ExpertSummary
