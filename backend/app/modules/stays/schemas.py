import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.stays.models import AmenityKey, PropertyStatus, PropertyType, RatePlanAdjustmentType, RatePlanType


class PropertyCreate(BaseModel):
    name: str
    description: str | None = None
    property_type: PropertyType


class PropertyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    property_type: PropertyType | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    cancellation_policy: str | None = None
    house_rules: str | None = None
    children_allowed: bool | None = None
    pets_allowed: bool | None = None
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100)
    service_charge_rate: Decimal | None = Field(default=None, ge=0, le=100)


class AmenitySet(BaseModel):
    amenities: list[AmenityKey]


class AmenityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    amenity: AmenityKey


class RoomTypeCreate(BaseModel):
    name: str
    description: str | None = None
    max_occupancy: int = 2
    base_price: Decimal
    total_units: int = 1
    min_stay_nights: int | None = Field(default=None, ge=1)


class RoomTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    max_occupancy: int | None = None
    base_price: Decimal | None = None
    total_units: int | None = None
    min_stay_nights: int | None = Field(default=None, ge=1)


class RoomTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    max_occupancy: int
    base_price: Decimal
    total_units: int
    min_stay_nights: int | None


class RatePlanCreate(BaseModel):
    name: str
    rate_type: RatePlanType
    adjustment_type: RatePlanAdjustmentType
    adjustment_value: Decimal
    start_date: date | None = None
    end_date: date | None = None
    applies_to_weekends: bool = False
    min_days_before_checkin: int | None = Field(default=None, ge=0)
    min_quantity: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _check(self):
        if not any(
            [self.start_date, self.end_date, self.applies_to_weekends, self.min_days_before_checkin, self.min_quantity]
        ):
            raise ValueError(
                "A rate plan needs at least one qualifying condition (date range, weekends, "
                "min days before check-in, or min quantity) — otherwise it would apply to every night forever"
            )
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if self.adjustment_type == RatePlanAdjustmentType.PERCENTAGE and self.adjustment_value <= -100:
            raise ValueError("A percentage discount can't be 100% or more")
        return self


class RatePlanUpdate(BaseModel):
    name: str | None = None
    adjustment_type: RatePlanAdjustmentType | None = None
    adjustment_value: Decimal | None = None
    start_date: date | None = None
    end_date: date | None = None
    applies_to_weekends: bool | None = None
    min_days_before_checkin: int | None = Field(default=None, ge=0)
    min_quantity: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


class RatePlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    room_type_id: uuid.UUID
    name: str
    rate_type: RatePlanType
    adjustment_type: RatePlanAdjustmentType
    adjustment_value: Decimal
    start_date: date | None
    end_date: date | None
    applies_to_weekends: bool
    min_days_before_checkin: int | None
    min_quantity: int | None
    is_active: bool
    created_at: datetime


class AvailabilityRangeSet(BaseModel):
    room_type_id: uuid.UUID
    start_date: date
    end_date: date
    available_units: int
    price_override: Decimal | None = None


class AvailabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    date: date
    available_units: int
    price_override: Decimal | None


class PropertyImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    file_name: str
    sort_order: int


class PropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    host_role_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    property_type: PropertyType
    status: PropertyStatus
    rejection_reason: str | None
    check_in_time: str | None
    check_out_time: str | None
    cancellation_policy: str | None
    house_rules: str | None
    children_allowed: bool
    pets_allowed: bool
    tax_rate: Decimal | None
    service_charge_rate: Decimal | None
    created_at: datetime
    room_types: list[RoomTypeRead] = []
    amenities: list[AmenityRead] = []
    images: list[PropertyImageRead] = []


class PropertySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    property_type: PropertyType
    status: PropertyStatus
