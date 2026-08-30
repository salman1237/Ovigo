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
    group_size: int = Field(default=1, ge=1)
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    location_id: uuid.UUID

    @model_validator(mode="after")
    def check_dates_and_budget(self) -> "CustomTourRequestCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if self.budget_min is not None and self.budget_max is not None and self.budget_max < self.budget_min:
            raise ValueError("budget_max cannot be less than budget_min")
        return self


class CustomTourRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str
    start_date: date
    end_date: date
    group_size: int
    budget_min: Decimal | None
    budget_max: Decimal | None
    status: RequestStatus
    created_at: datetime
    bid_count: int = 0


class BidCreate(BaseModel):
    price: Decimal = Field(gt=0)
    message: str | None = Field(default=None, max_length=2000)
    itinerary: list[ItineraryDayIn] = Field(default_factory=list, min_length=1)


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
    status: BidStatus
    created_at: datetime
    expert: ExpertSummary


class BidWithBookingRead(BaseModel):
    bid: BidRead
    booking_id: uuid.UUID
