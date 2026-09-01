"""Rent-a-Car (technical document Phase 2, Sprint 14-15): vehicles, drivers,
pricing, and per-date availability. Mirrors the Stays module's shape closely —
`Vehicle` is the direct bookable unit (there's no separate "vehicle type" plus
pooled units the way `Property`/`RoomType` splits stays; a rent-a-car listing
here is one specific car, so booking quantity is always 1) and
`VehicleAvailability` mirrors `AvailabilityCalendar` but as a plain boolean per
date rather than a unit count, since there's exactly one of each vehicle.

Deliberate scope trim vs. Stays/Tours: no vehicle photo gallery in this pass —
the R2 upload wiring those modules have would be straightforward to add the
same way later, it just wasn't worth the extra surface for this sprint's
first cut of a whole new vertical. `Driver` is a simple roster a Rent-a-Car
partner maintains for their own reference (name, license, phone); a vehicle
can optionally point at one via `assigned_driver_id`, but there's no
per-booking driver assignment/dispatch workflow — that's the same kind of
follow-up work as Guide assignments were for Local Experts (Sprint 12-13),
not attempted here to keep this sprint's scope bounded.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class VehicleType(str, enum.Enum):
    SEDAN = "sedan"
    SUV = "suv"
    VAN = "van"
    MICROBUS = "microbus"
    MOTORCYCLE = "motorcycle"
    PICKUP = "pickup"


class TransmissionType(str, enum.Enum):
    MANUAL = "manual"
    AUTOMATIC = "automatic"


class VehicleStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rent_a_car_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    full_name: Mapped[str] = mapped_column(String(255))
    license_number: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rent_a_car_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    assigned_driver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True
    )
    make: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    year: Mapped[int] = mapped_column(Integer)
    vehicle_type: Mapped[VehicleType] = mapped_column(Enum(VehicleType, name="vehicle_type"))
    transmission: Mapped[TransmissionType] = mapped_column(Enum(TransmissionType, name="transmission_type"))
    seats: Mapped[int] = mapped_column(Integer, default=4)
    price_per_day: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    with_driver: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[VehicleStatus] = mapped_column(Enum(VehicleStatus, name="vehicle_status"), default=VehicleStatus.DRAFT)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    rent_a_car_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    assigned_driver: Mapped["Driver | None"] = relationship()


class VehicleAvailability(Base):
    __tablename__ = "vehicle_availability"
    __table_args__ = (UniqueConstraint("vehicle_id", "date", name="uq_vehicle_availability_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
