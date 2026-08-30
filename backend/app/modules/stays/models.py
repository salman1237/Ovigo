"""Properties (stays), room types, and per-date availability.

Deliberate simplifications vs. the technical document's full schema (documented so
they're easy to revisit): `property_policies` is embedded as columns on `properties`
rather than a separate table — it's a genuine 1:1 relationship with no independent
lifecycle, so splitting it buys nothing yet. `availability_calendars` doubles as the
inventory ledger (`available_units` per room type per date) and carries an optional
per-date `price_override` — a full separate `inventory` ledger and `pricing_rules`
rate-plan engine (seasonal/weekend/corporate rates) are Phase 3 "Advanced Pricing
Engine" work per the technical document's own phase plan; this is enough to search,
display, and (in Sprint 7-8) book against.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PropertyType(str, enum.Enum):
    HOTEL = "hotel"
    RESORT = "resort"
    HOMESTAY = "homestay"
    GUESTHOUSE = "guesthouse"


class PropertyStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"


class AmenityKey(str, enum.Enum):
    WIFI = "wifi"
    POOL = "pool"
    PARKING = "parking"
    AC = "ac"
    BREAKFAST_INCLUDED = "breakfast_included"
    PET_FRIENDLY = "pet_friendly"
    AIRPORT_PICKUP = "airport_pickup"
    TV = "tv"
    HOT_WATER = "hot_water"
    KITCHEN = "kitchen"


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    property_type: Mapped[PropertyType] = mapped_column(Enum(PropertyType, name="property_type"))
    status: Mapped[PropertyStatus] = mapped_column(
        Enum(PropertyStatus, name="property_status"), default=PropertyStatus.DRAFT
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Policies (embedded — see module docstring)
    check_in_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    check_out_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cancellation_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    house_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    children_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    pets_allowed: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    host_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    room_types: Mapped[list["RoomType"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    amenities: Mapped[list["PropertyAmenity"]] = relationship(back_populates="property", cascade="all, delete-orphan")


class PropertyAmenity(Base):
    __tablename__ = "property_amenities"
    __table_args__ = (UniqueConstraint("property_id", "amenity", name="uq_property_amenity"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"))
    amenity: Mapped[AmenityKey] = mapped_column(Enum(AmenityKey, name="amenity_key"))

    property: Mapped["Property"] = relationship(back_populates="amenities")


class RoomType(Base):
    __tablename__ = "room_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_occupancy: Mapped[int] = mapped_column(Integer, default=2)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    total_units: Mapped[int] = mapped_column(Integer, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    property: Mapped["Property"] = relationship(back_populates="room_types")
    availability: Mapped[list["AvailabilityCalendar"]] = relationship(
        back_populates="room_type", cascade="all, delete-orphan"
    )


class AvailabilityCalendar(Base):
    __tablename__ = "availability_calendars"
    __table_args__ = (UniqueConstraint("room_type_id", "date", name="uq_availability_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("room_types.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    available_units: Mapped[int] = mapped_column(Integer)
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    room_type: Mapped["RoomType"] = relationship(back_populates="availability")
