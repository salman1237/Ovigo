import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.stays.models import AmenityKey, PropertyStatus, PropertyType


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


class RoomTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    max_occupancy: int
    base_price: Decimal
    total_units: int


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
    created_at: datetime
    room_types: list[RoomTypeRead] = []
    amenities: list[AmenityRead] = []


class PropertySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    property_type: PropertyType
    status: PropertyStatus
