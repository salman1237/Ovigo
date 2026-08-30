import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.tours.models import MealType, TourStatus


class TourCreate(BaseModel):
    title: str
    description: str | None = None
    duration_days: int
    base_price: Decimal
    max_group_size: int = 10


class TourUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_days: int | None = None
    base_price: Decimal | None = None
    max_group_size: int | None = None


class ItineraryDayCreate(BaseModel):
    day_number: int
    title: str
    description: str | None = None


class ItineraryDayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    day_number: int
    title: str
    description: str | None


class DepartureCreate(BaseModel):
    departure_date: date
    available_seats: int
    price_override: Decimal | None = None


class DepartureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    departure_date: date
    available_seats: int
    price_override: Decimal | None


class MealCreate(BaseModel):
    meal_type: MealType
    description: str | None = None


class MealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    meal_type: MealType
    description: str | None


class ActivityCreate(BaseModel):
    name: str
    description: str | None = None
    is_included: bool = True


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    is_included: bool


class AddonCreate(BaseModel):
    name: str
    description: str | None = None
    price: Decimal


class AddonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    price: Decimal


class TransportCreate(BaseModel):
    mode: str
    description: str | None = None


class TransportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    mode: str
    description: str | None


class TourStayCreate(BaseModel):
    property_id: uuid.UUID | None = None
    description: str
    nights: int = 1


class TourStayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    property_id: uuid.UUID | None
    description: str
    nights: int


class TourImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    file_name: str
    sort_order: int


class TourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    local_expert_role_id: uuid.UUID
    title: str
    slug: str
    description: str | None
    duration_days: int
    base_price: Decimal
    max_group_size: int
    status: TourStatus
    rejection_reason: str | None
    created_at: datetime
    itinerary: list[ItineraryDayRead] = []
    departures: list[DepartureRead] = []
    meals: list[MealRead] = []
    activities: list[ActivityRead] = []
    addons: list[AddonRead] = []
    transport: list[TransportRead] = []
    stays: list[TourStayRead] = []
    images: list[TourImageRead] = []


class TourSummary(BaseModel):
    """Lightweight shape for search/listing results — no sub-resources."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    slug: str
    description: str | None
    duration_days: int
    base_price: Decimal
    status: TourStatus
