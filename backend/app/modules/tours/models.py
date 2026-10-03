"""Fixed-date tours and their sub-resources according to PRD Section 10 & 25.

Fully covers PRD Sections 10.1 (14 Tour Types), 10.2 (Fixed-Calendar Departures),
10.3 (Mandatory Tour Inclusions, Stays, Transport, Food, Safety, Pricing),
and 10.4 (14 Tour Lifecycle Statuses).
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TourStatus(str, enum.Enum):
    # Core PRD 10.4 statuses
    DRAFT = "draft"
    SUBMITTED_FOR_REVIEW = "submitted_for_review"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    BOOKING_OPEN = "booking_open"
    ALMOST_FULL = "almost_full"
    SOLD_OUT = "sold_out"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"
    # Backward compatibility aliases
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"


class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class TourType(str, enum.Enum):
    # 14 types per PRD Section 10.1
    FIXED_DEPARTURE = "fixed_departure"
    PRIVATE = "private"
    GROUP = "group"
    GROUND = "ground"
    DAY = "day"
    MULTI_DAY = "multi_day"
    EXPERIENCE = "experience"
    FAMILY = "family"
    COUPLE = "couple"
    ADVENTURE = "adventure"
    FOOD = "food"
    PHOTOGRAPHY = "photography"
    CULTURAL = "cultural"
    CORPORATE = "corporate"
    # Backward compatibility with existing DB entries
    ROMANTIC = "romantic"
    WILDLIFE = "wildlife"
    BEACH = "beach"
    TREKKING = "trekking"
    CITY = "city"
    CRUISE = "cruise"
    RELIGIOUS = "religious"


class Tour(Base):
    __tablename__ = "tours"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    local_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    short_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_days: Mapped[int] = mapped_column(Integer)
    duration_nights: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    min_group_size: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    max_group_size: Mapped[int] = mapped_column(Integer, default=10)
    status: Mapped[TourStatus] = mapped_column(Enum(TourStatus, name="tour_status"), default=TourStatus.DRAFT)
    tour_type: Mapped[TourType | None] = mapped_column(Enum(TourType, name="tour_type"), nullable=True)
    suitable_traveler_type: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    primary_destination_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )

    # Tiered and multi-tier pricing (PRD 10.3 & 10.5)
    child_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    infant_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    price_per_group: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    single_room_supplement: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    couple_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    seasonal_pricing: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    weekend_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    early_bird_discount: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    group_discount: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)  # e.g. 0.05 = 5%
    service_charge_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    deposit_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    payment_deadline_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Inclusions & Exclusions lists (PRD 10.3)
    included_services: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    excluded_services: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    # Pickup & Drop-off profile (PRD 10.3)
    pickup_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pickup_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dropoff_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dropoff_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pickup_coordinates: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    pickup_window: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pickup_contact_person: Mapped[str | None] = mapped_column(String(100), nullable=True)
    home_hotel_pickup_available: Mapped[bool] = mapped_column(Boolean, default=False)
    home_pickup_extra_charge: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    late_arrival_policy: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Safety & Security profile (PRD 10.3 & 10.6)
    nearest_hospital: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_aid_available: Mapped[bool] = mapped_column(Boolean, default=True)
    women_safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    night_travel_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    permit_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    insurance_included: Mapped[bool] = mapped_column(Boolean, default=False)
    emergency_procedure: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    weather_risk_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_risk_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Policies (PRD 10.3)
    cancellation_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    refund_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    child_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    rescheduling_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_participant_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    bad_weather_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    no_show_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    pet_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessibility_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    traveler_conduct_policy: Mapped[str | None] = mapped_column(Text, nullable=True)

    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    local_expert_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    primary_destination: Mapped["Location | None"] = relationship(foreign_keys=[primary_destination_id])  # noqa: F821
    itinerary: Mapped[list["TourItineraryDay"]] = relationship(
        back_populates="tour", cascade="all, delete-orphan", order_by="TourItineraryDay.day_number"
    )
    departures: Mapped[list["TourDeparture"]] = relationship(
        back_populates="tour", cascade="all, delete-orphan", order_by="TourDeparture.departure_date"
    )
    meals: Mapped[list["TourMeal"]] = relationship(back_populates="tour", cascade="all, delete-orphan")
    activities: Mapped[list["TourActivity"]] = relationship(back_populates="tour", cascade="all, delete-orphan")
    addons: Mapped[list["TourAddon"]] = relationship(back_populates="tour", cascade="all, delete-orphan")
    transport: Mapped[list["TourTransport"]] = relationship(back_populates="tour", cascade="all, delete-orphan")
    stays: Mapped[list["TourStay"]] = relationship(back_populates="tour", cascade="all, delete-orphan")
    images: Mapped[list["TourImage"]] = relationship(
        back_populates="tour", cascade="all, delete-orphan", order_by="TourImage.sort_order"
    )


class TourItineraryDay(Base):
    __tablename__ = "tour_itineraries"
    __table_args__ = (UniqueConstraint("tour_id", "day_number", name="uq_tour_itinerary_day"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    day_number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    arrival_time: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g. "9:00 AM"
    departure_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    activity_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_fee_included: Mapped[bool] = mapped_column(Boolean, default=True)
    accessibility_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    tour: Mapped["Tour"] = relationship(back_populates="itinerary")


class TourDeparture(Base):
    __tablename__ = "tour_departures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    departure_date: Mapped[date] = mapped_column(Date)
    return_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    departure_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    return_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    booking_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    min_participants: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    max_participants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_seats: Mapped[int] = mapped_column(Integer)
    confirmation_threshold: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="open")  # open, confirmed, cancelled, completed
    recurrence_rule: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assigned_guide_role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="SET NULL"), nullable=True
    )

    tour: Mapped["Tour"] = relationship(back_populates="departures")
    assigned_guide_role: Mapped["PartnerRole | None"] = relationship(foreign_keys=[assigned_guide_role_id])  # noqa: F821


class TourMeal(Base):
    __tablename__ = "tour_meals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    day_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meal_type: Mapped[MealType] = mapped_column(Enum(MealType, name="meal_type"))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_vegetarian: Mapped[bool] = mapped_column(Boolean, default=False)
    is_vegan: Mapped[bool] = mapped_column(Boolean, default=False)
    is_halal: Mapped[bool] = mapped_column(Boolean, default=True)
    allergy_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    children_menu_available: Mapped[bool] = mapped_column(Boolean, default=False)
    restaurant_provider: Mapped[str | None] = mapped_column(String(255), nullable=True)
    optional_upgrade_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    tour: Mapped["Tour"] = relationship(back_populates="meals")


class TourActivity(Base):
    __tablename__ = "tour_activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    day_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_hours: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(50), nullable=True)  # easy/moderate/challenging
    min_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    equipment_needed: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    guide_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_high_risk: Mapped[bool] = mapped_column(Boolean, default=False)
    weather_dependency: Mapped[str | None] = mapped_column(String(100), nullable=True)
    addon_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    tour: Mapped["Tour"] = relationship(back_populates="activities")


class TourAddon(Base):
    __tablename__ = "tour_addons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    tour: Mapped["Tour"] = relationship(back_populates="addons")


class TourTransport(Base):
    __tablename__ = "tour_transport"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    vehicle_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vehicle_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    driver_included: Mapped[bool] = mapped_column(Boolean, default=True)
    has_ac: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    driver_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    intercity_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    local_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    pickup_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pickup_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dropoff_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dropoff_time: Mapped[str | None] = mapped_column(String(50), nullable=True)
    route_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    luggage_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)

    tour: Mapped["Tour"] = relationship(back_populates="transport")


class TourStay(Base):
    __tablename__ = "tour_stays"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True
    )
    stay_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(String(255))
    nights: Mapped[int] = mapped_column(Integer, default=1)
    property_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    room_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    occupancy_arrangement: Mapped[str | None] = mapped_column(String(100), nullable=True)
    room_sharing_policy: Mapped[str | None] = mapped_column(String(255), nullable=True)
    check_in_out_info: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stay_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stay_photos: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(50), nullable=True, default="external")

    tour: Mapped["Tour"] = relationship(back_populates="stays")


class TourImage(Base):
    __tablename__ = "tour_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    storage_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    file_name: Mapped[str] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tour: Mapped["Tour"] = relationship(back_populates="images")
