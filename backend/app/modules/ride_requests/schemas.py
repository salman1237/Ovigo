import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.ride_requests.models import RideBidStatus, RideRequestStatus
from app.modules.rentcar.models import VehicleType


class RideRequestCreate(BaseModel):
    pickup_label: str = Field(min_length=1, max_length=255)
    pickup_lat: Decimal
    pickup_lng: Decimal
    dropoff_label: str = Field(min_length=1, max_length=255)
    dropoff_lat: Decimal
    dropoff_lng: Decimal
    departure_date: date
    departure_time: time | None = None
    passengers: int = Field(default=1, ge=1)
    vehicle_type_preference: VehicleType | None = None
    with_driver_preference: bool | None = None
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    notes: str | None = Field(default=None, max_length=2000)
    bid_deadline: datetime | None = None

    @model_validator(mode="after")
    def check_budget(self) -> "RideRequestCreate":
        if self.budget_min is not None and self.budget_max is not None and self.budget_max < self.budget_min:
            raise ValueError("budget_max cannot be less than budget_min")
        return self


class RideRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pickup_label: str
    pickup_lat: Decimal
    pickup_lng: Decimal
    dropoff_label: str
    dropoff_lat: Decimal
    dropoff_lng: Decimal
    departure_date: date
    departure_time: time | None
    passengers: int
    vehicle_type_preference: VehicleType | None
    with_driver_preference: bool | None
    budget_min: Decimal | None
    budget_max: Decimal | None
    notes: str | None
    bid_deadline: datetime | None
    status: RideRequestStatus
    created_at: datetime
    bid_count: int = 0


class RideBidCreate(BaseModel):
    vehicle_id: uuid.UUID | None = None
    price: Decimal = Field(gt=0)
    message: str | None = Field(default=None, max_length=2000)
    with_driver: bool = False
    valid_until: datetime | None = None


class PartnerSummary(BaseModel):
    id: uuid.UUID  # partner_role_id, not user_id — the natural key on the partner side of a bid
    full_name: str


class VehicleSummary(BaseModel):
    id: uuid.UUID
    make: str
    model: str
    year: int


class RideBidRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    request_id: uuid.UUID
    price: Decimal
    message: str | None
    with_driver: bool
    valid_until: datetime | None
    status: RideBidStatus
    created_at: datetime
    partner: PartnerSummary
    vehicle: VehicleSummary | None


class RideBidWithBookingRead(BaseModel):
    bid: RideBidRead
    booking_id: uuid.UUID
