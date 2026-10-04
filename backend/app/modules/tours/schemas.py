import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.tours.models import MealType, TourStatus, TourType


class TourCreate(BaseModel):
    title: str
    description: str | None = None
    short_summary: str | None = None
    duration_days: int
    duration_nights: int | None = 0
    base_price: Decimal
    min_group_size: int | None = 1
    max_group_size: int = 10
    tour_type: TourType | None = None
    suitable_traveler_type: list[str] | None = None
    primary_destination_id: uuid.UUID | None = None

    # Pricing & Inclusions (PRD 10.3 & 10.5)
    child_price: Decimal | None = None
    infant_price: Decimal | None = None
    price_per_group: Decimal | None = None
    single_room_supplement: Decimal | None = None
    couple_price: Decimal | None = None
    seasonal_pricing: dict | None = None
    weekend_price: Decimal | None = None
    early_bird_discount: Decimal | None = None
    group_discount: Decimal | None = None
    currency: str = "BDT"
    tax_rate: Decimal | None = None
    service_charge_rate: Decimal | None = None
    deposit_percentage: Decimal | None = None
    payment_deadline_days: int | None = None
    included_services: list[str] | None = None
    excluded_services: list[str] | None = None

    # Pickup & Drop-off (PRD 10.3)
    pickup_location: str | None = None
    pickup_time: str | None = None
    dropoff_location: str | None = None
    dropoff_time: str | None = None
    pickup_coordinates: dict | None = None
    pickup_window: str | None = None
    pickup_contact_person: str | None = None
    home_hotel_pickup_available: bool = False
    home_pickup_extra_charge: Decimal | None = None
    late_arrival_policy: str | None = None

    # Safety & Security (PRD 10.3 & 10.6)
    nearest_hospital: str | None = None
    first_aid_available: bool = True
    women_safety_notes: str | None = None
    child_safety_notes: str | None = None
    night_travel_policy: str | None = None
    permit_requirements: str | None = None
    insurance_included: bool = False
    emergency_procedure: str | None = None
    emergency_contact_phone: str | None = None
    weather_risk_note: str | None = None
    activity_risk_note: str | None = None

    # Policies (PRD 10.3)
    cancellation_policy: str | None = None
    refund_policy: str | None = None
    child_policy: str | None = None
    rescheduling_policy: str | None = None
    min_participant_policy: str | None = None
    bad_weather_policy: str | None = None
    no_show_policy: str | None = None
    pet_policy: str | None = None
    accessibility_policy: str | None = None
    traveler_conduct_policy: str | None = None


class TourUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    short_summary: str | None = None
    duration_days: int | None = None
    duration_nights: int | None = None
    base_price: Decimal | None = None
    min_group_size: int | None = None
    max_group_size: int | None = None
    tour_type: TourType | None = None
    suitable_traveler_type: list[str] | None = None
    primary_destination_id: uuid.UUID | None = None

    child_price: Decimal | None = None
    infant_price: Decimal | None = None
    price_per_group: Decimal | None = None
    single_room_supplement: Decimal | None = None
    couple_price: Decimal | None = None
    seasonal_pricing: dict | None = None
    weekend_price: Decimal | None = None
    early_bird_discount: Decimal | None = None
    group_discount: Decimal | None = None
    currency: str | None = None
    tax_rate: Decimal | None = None
    service_charge_rate: Decimal | None = None
    deposit_percentage: Decimal | None = None
    payment_deadline_days: int | None = None
    included_services: list[str] | None = None
    excluded_services: list[str] | None = None

    pickup_location: str | None = None
    pickup_time: str | None = None
    dropoff_location: str | None = None
    dropoff_time: str | None = None
    pickup_coordinates: dict | None = None
    pickup_window: str | None = None
    pickup_contact_person: str | None = None
    home_hotel_pickup_available: bool | None = None
    home_pickup_extra_charge: Decimal | None = None
    late_arrival_policy: str | None = None

    nearest_hospital: str | None = None
    first_aid_available: bool | None = None
    women_safety_notes: str | None = None
    child_safety_notes: str | None = None
    night_travel_policy: str | None = None
    permit_requirements: str | None = None
    insurance_included: bool | None = None
    emergency_procedure: str | None = None
    emergency_contact_phone: str | None = None
    weather_risk_note: str | None = None
    activity_risk_note: str | None = None

    cancellation_policy: str | None = None
    refund_policy: str | None = None
    child_policy: str | None = None
    rescheduling_policy: str | None = None
    min_participant_policy: str | None = None
    bad_weather_policy: str | None = None
    no_show_policy: str | None = None
    pet_policy: str | None = None
    accessibility_policy: str | None = None
    traveler_conduct_policy: str | None = None


class TourStatusUpdate(BaseModel):
    status: TourStatus
    reason: str | None = None


class ItineraryDayCreate(BaseModel):
    day_number: int
    title: str
    description: str | None = None
    location_name: str | None = None
    arrival_time: str | None = None
    departure_time: str | None = None
    activity_summary: str | None = None
    entry_fee_included: bool = True
    accessibility_notes: str | None = None
    safety_notes: str | None = None


class ItineraryDayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    day_number: int
    title: str
    description: str | None
    location_name: str | None
    arrival_time: str | None
    departure_time: str | None
    activity_summary: str | None = None
    entry_fee_included: bool = True
    accessibility_notes: str | None = None
    safety_notes: str | None = None


class DepartureCreate(BaseModel):
    departure_date: date
    return_date: date | None = None
    departure_time: str | None = None
    return_time: str | None = None
    booking_deadline: datetime | None = None
    min_participants: int | None = 1
    max_participants: int | None = None
    available_seats: int
    confirmation_threshold: int | None = None
    price_override: Decimal | None = None
    status: str = "open"
    recurrence_rule: str | None = None
    assigned_guide_role_id: uuid.UUID | None = None


class DepartureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    departure_date: date
    return_date: date | None = None
    departure_time: str | None = None
    return_time: str | None = None
    booking_deadline: datetime | None = None
    min_participants: int | None = 1
    max_participants: int | None = None
    available_seats: int
    confirmation_threshold: int | None = None
    price_override: Decimal | None
    status: str = "open"
    recurrence_rule: str | None = None
    assigned_guide_role_id: uuid.UUID | None = None


class AssignGuidePayload(BaseModel):
    guide_role_id: uuid.UUID
    fee_amount: Decimal | None = None


class MealCreate(BaseModel):
    day_number: int | None = None
    meal_type: MealType
    description: str | None = None
    is_vegetarian: bool = False
    is_vegan: bool = False
    is_halal: bool = True
    allergy_notes: str | None = None
    children_menu_available: bool = False
    restaurant_provider: str | None = None
    optional_upgrade_price: Decimal | None = None


class MealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    day_number: int | None = None
    meal_type: MealType
    description: str | None
    is_vegetarian: bool = False
    is_vegan: bool = False
    is_halal: bool = True
    allergy_notes: str | None = None
    children_menu_available: bool = False
    restaurant_provider: str | None = None
    optional_upgrade_price: Decimal | None = None


class ActivityCreate(BaseModel):
    day_number: int | None = None
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
    weather_dependency: str | None = None
    addon_price: Decimal | None = None


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    day_number: int | None = None
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
    weather_dependency: str | None = None
    addon_price: Decimal | None = None


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
    provider_name: str | None = None
    vehicle_type: str | None = None
    vehicle_model: str | None = None
    driver_included: bool = True
    has_ac: bool | None = None
    capacity: int | None = None
    driver_name: str | None = None
    intercity_details: str | None = None
    local_details: str | None = None
    pickup_location: str | None = None
    pickup_time: str | None = None
    dropoff_location: str | None = None
    dropoff_time: str | None = None
    route_info: str | None = None
    luggage_policy: str | None = None


class TransportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    mode: str
    description: str | None
    provider_name: str | None = None
    vehicle_type: str | None = None
    vehicle_model: str | None = None
    driver_included: bool = True
    has_ac: bool | None
    capacity: int | None
    driver_name: str | None
    intercity_details: str | None = None
    local_details: str | None = None
    pickup_location: str | None = None
    pickup_time: str | None = None
    dropoff_location: str | None = None
    dropoff_time: str | None = None
    route_info: str | None = None
    luggage_policy: str | None = None


class TourStayCreate(BaseModel):
    property_id: uuid.UUID | None = None
    stay_name: str | None = None
    description: str
    nights: int = 1
    property_type: str | None = None
    room_category: str | None = None
    occupancy_arrangement: str | None = None
    room_sharing_policy: str | None = None
    check_in_out_info: str | None = None
    stay_location: str | None = None
    stay_photos: list[str] | None = None
    source_type: str | None = "external"


class TourStayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    property_id: uuid.UUID | None
    stay_name: str | None = None
    description: str
    nights: int
    property_type: str | None
    room_category: str | None
    occupancy_arrangement: str | None = None
    room_sharing_policy: str | None = None
    check_in_out_info: str | None = None
    stay_location: str | None = None
    stay_photos: list[str] | None = None
    source_type: str | None = "external"


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
    short_summary: str | None = None
    duration_days: int
    duration_nights: int | None = 0
    base_price: Decimal
    min_group_size: int | None = 1
    max_group_size: int
    status: TourStatus
    rejection_reason: str | None
    created_at: datetime
    tour_type: TourType | None
    suitable_traveler_type: list[str] | None = None
    primary_destination_id: uuid.UUID | None = None

    # Pricing & Inclusions
    child_price: Decimal | None
    infant_price: Decimal | None
    price_per_group: Decimal | None = None
    single_room_supplement: Decimal | None = None
    couple_price: Decimal | None = None
    seasonal_pricing: dict | None = None
    weekend_price: Decimal | None = None
    early_bird_discount: Decimal | None = None
    group_discount: Decimal | None = None
    currency: str = "BDT"
    tax_rate: Decimal | None
    service_charge_rate: Decimal | None
    deposit_percentage: Decimal | None
    payment_deadline_days: int | None
    included_services: list[str] | None = None
    excluded_services: list[str] | None = None

    # Pickup & Drop-off
    pickup_location: str | None = None
    pickup_time: str | None = None
    dropoff_location: str | None = None
    dropoff_time: str | None = None
    pickup_coordinates: dict | None = None
    pickup_window: str | None = None
    pickup_contact_person: str | None = None
    home_hotel_pickup_available: bool = False
    home_pickup_extra_charge: Decimal | None = None
    late_arrival_policy: str | None = None

    # Safety & Security
    nearest_hospital: str | None = None
    first_aid_available: bool = True
    women_safety_notes: str | None = None
    child_safety_notes: str | None = None
    night_travel_policy: str | None = None
    permit_requirements: str | None = None
    insurance_included: bool = False
    emergency_procedure: str | None = None
    emergency_contact_phone: str | None
    weather_risk_note: str | None
    activity_risk_note: str | None

    # Policies
    cancellation_policy: str | None
    refund_policy: str | None
    child_policy: str | None
    rescheduling_policy: str | None = None
    min_participant_policy: str | None = None
    bad_weather_policy: str | None = None
    no_show_policy: str | None = None
    pet_policy: str | None = None
    accessibility_policy: str | None = None
    traveler_conduct_policy: str | None = None

    itinerary: list[ItineraryDayRead] = []
    departures: list[DepartureRead] = []
    meals: list[MealRead] = []
    activities: list[ActivityRead] = []
    addons: list[AddonRead] = []
    transport: list[TransportRead] = []
    stays: list[TourStayRead] = []
    images: list[TourImageRead] = []


class TourExpertCard(BaseModel):
    """Who runs this tour (PRD §10.3 "Responsible Local Expert"), for the public tour
    page's "Your local expert" card. Built by profiles/service.py::tour_expert_card."""

    partner_role_id: uuid.UUID
    name: str
    headline: str | None
    photo_url: str | None
    years_experience: int | None
    languages: list[str]
    primary_destination: str | None
    profile_public: bool  # /experts/{id} is published
    identity_verified: bool
    member_since: datetime | None
    rating_avg: Decimal | None
    reviews_count: int
    completed_bookings: int
    response_rate_percent: int | None
    avg_response_minutes: int | None


class PublicTourRead(TourRead):
    expert: TourExpertCard | None = None


class TourSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    slug: str
    description: str | None
    short_summary: str | None = None
    duration_days: int
    duration_nights: int | None = 0
    base_price: Decimal
    currency: str = "BDT"
    status: TourStatus
    tour_type: TourType | None
    pickup_location: str | None = None
    images: list[TourImageRead] = []
