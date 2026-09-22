import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.tours.models import MealType, TourStatus, TourType


class TourCreate(BaseModel):
    title: str
    description: str | None = None
    duration_days: int
    base_price: Decimal
    max_group_size: int = 10
    tour_type: TourType | None = None
    child_price: Decimal | None = None
    infant_price: Decimal | None = None
    tax_rate: Decimal | None = None
    service_charge_rate: Decimal | None = None
    deposit_percentage: Decimal | None = None
    payment_deadline_days: int | None = None
    cancellation_policy: str | None = None
    refund_policy: str | None = None
    child_policy: str | None = None
    emergency_contact_phone: str | None = None
    weather_risk_note: str | None = None
    activity_risk_note: str | None = None


class TourUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_days: int | None = None
    base_price: Decimal | None = None
    max_group_size: int | None = None
    tour_type: TourType | None = None
    child_price: Decimal | None = None
    infant_price: Decimal | None = None
    tax_rate: Decimal | None = None
    service_charge_rate: Decimal | None = None
    deposit_percentage: Decimal | None = None
    payment_deadline_days: int | None = None
    cancellation_policy: str | None = None
    refund_policy: str | None = None
    child_policy: str | None = None
    emergency_contact_phone: str | None = None
    weather_risk_note: str | None = None
    activity_risk_note: str | None = None


class ItineraryDayCreate(BaseModel):
    day_number: int
    title: str
    description: str | None = None
    location_name: str | None = None
    arrival_time: str | None = None
    departure_time: str | None = None


class ItineraryDayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    day_number: int
    title: str
    description: str | None
    location_name: str | None
    arrival_time: str | None
    departure_time: str | None


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
    duration_hours: Decimal | None = None
    location_name: str | None = None
    difficulty: str | None = None
    min_age: int | None = None
    equipment_needed: str | None = None
    max_capacity: int | None = None
    safety_notes: str | None = None
    guide_required: bool = False
    is_high_risk: bool = False


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    is_included: bool
    duration_hours: Decimal | None
    location_name: str | None
    difficulty: str | None
    min_age: int | None
    equipment_needed: str | None
    max_capacity: int | None
    safety_notes: str | None
    guide_required: bool
    is_high_risk: bool


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
    vehicle_type: str | None = None
    has_ac: bool | None = None
    capacity: int | None = None
    driver_name: str | None = None


class TransportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    mode: str
    description: str | None
    vehicle_type: str | None
    has_ac: bool | None
    capacity: int | None
    driver_name: str | None


class TourStayCreate(BaseModel):
    property_id: uuid.UUID | None = None
    description: str
    nights: int = 1
    property_type: str | None = None
    room_category: str | None = None


class TourStayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    property_id: uuid.UUID | None
    description: str
    nights: int
    property_type: str | None
    room_category: str | None


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
    tour_type: TourType | None
    child_price: Decimal | None
    infant_price: Decimal | None
    tax_rate: Decimal | None
    service_charge_rate: Decimal | None
    deposit_percentage: Decimal | None
    payment_deadline_days: int | None
    cancellation_policy: str | None
    refund_policy: str | None
    child_policy: str | None
    emergency_contact_phone: str | None
    weather_risk_note: str | None
    activity_risk_note: str | None
    itinerary: list[ItineraryDayRead] = []
    departures: list[DepartureRead] = []
    meals: list[MealRead] = []
    activities: list[ActivityRead] = []
    addons: list[AddonRead] = []
    transport: list[TransportRead] = []
    stays: list[TourStayRead] = []
    images: list[TourImageRead] = []


class TourSummary(BaseModel):
    """Lightweight shape for search/listing results — no sub-resources, but images
    are included since a listing card with no photo is the exact thing this shape
    otherwise trims for size — see list_published_tours's eager-loading."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    slug: str
    description: str | None
    duration_days: int
    base_price: Decimal
    status: TourStatus
    tour_type: TourType | None
    images: list[TourImageRead] = []
