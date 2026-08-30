"""Fixed-date tours and their sub-resources.

Deliberate simplifications vs. the technical document's full schema (documented so
they're easy to find and revisit): `tour_stays` and `tour_transport` are lightweight
descriptive line items rather than deep integrations requiring a specific Property/
Vehicle to exist first — that matches how these are usually sold ("3-star hotel
included", "AC bus transfer") without hard-coupling to inventory that may not be
listed on the platform yet. `tour_stays` can optionally reference a listed Property
if the expert wants to.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TourStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"


class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class Tour(Base):
    __tablename__ = "tours"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    local_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_days: Mapped[int] = mapped_column(Integer)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    max_group_size: Mapped[int] = mapped_column(Integer, default=10)
    status: Mapped[TourStatus] = mapped_column(Enum(TourStatus, name="tour_status"), default=TourStatus.DRAFT)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    local_expert_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
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

    tour: Mapped["Tour"] = relationship(back_populates="itinerary")


class TourDeparture(Base):
    __tablename__ = "tour_departures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    departure_date: Mapped[date] = mapped_column(Date)
    available_seats: Mapped[int] = mapped_column(Integer)
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    tour: Mapped["Tour"] = relationship(back_populates="departures")


class TourMeal(Base):
    __tablename__ = "tour_meals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    meal_type: Mapped[MealType] = mapped_column(Enum(MealType, name="meal_type"))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    tour: Mapped["Tour"] = relationship(back_populates="meals")


class TourActivity(Base):
    __tablename__ = "tour_activities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)

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

    tour: Mapped["Tour"] = relationship(back_populates="transport")


class TourStay(Base):
    __tablename__ = "tour_stays"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tour_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="CASCADE"))
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(255))
    nights: Mapped[int] = mapped_column(Integer, default=1)

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
