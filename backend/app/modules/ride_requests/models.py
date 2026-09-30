"""Rent-a-car ride bidding: a traveler posts a route (pickup -> drop-off, each a
free lat/lng + text label rather than a FK into the curated Location table — most
Location rows have no coordinates, so "snap to nearest known place" isn't usable
today; a real address/point is also just a better fit for "where I want to go"
than a district-level city anyway), departure date/time, and passenger count. Any
approved rent-a-car partner can submit a bid (price + which vehicle from their
fleet + optional driver). The traveler accepts one bid, which converts straight
into a real booking (see bookings/service.py's create_booking_from_ride_bid) —
same reuse-the-existing-pipeline approach as tour bidding
(bidding/models.py's CustomTourRequest/TourBid).

Unlike tour bidding, this module does not gate visibility by tagged location —
every open request is visible to every approved rent-a-car partner (a flat open
marketplace). Tour bidding's eligibility check depends on the curated Location
hierarchy, which pickup/drop-off deliberately don't use here (see above), so
there's no matching mechanism to reuse without building a new geo-distance
system — out of scope until there's a concrete reason to restrict by distance.
"""
import enum
import uuid
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, Time, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.rentcar.models import VehicleType


class RideRequestStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"  # a bid was accepted
    CANCELLED = "cancelled"  # traveler cancelled before accepting any bid


class RideBidStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"  # a different bid on the same request was accepted
    WITHDRAWN = "withdrawn"  # the partner pulled it back


class RideRequest(Base):
    __tablename__ = "ride_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    traveler_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    pickup_label: Mapped[str] = mapped_column(String(255))
    pickup_lat: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    pickup_lng: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    dropoff_label: Mapped[str] = mapped_column(String(255))
    dropoff_lat: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    dropoff_lng: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    departure_date: Mapped[date] = mapped_column(Date)
    departure_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    passengers: Mapped[int] = mapped_column(Integer, default=1)
    vehicle_type_preference: Mapped[VehicleType | None] = mapped_column(
        Enum(VehicleType, name="vehicle_type"), nullable=True
    )
    # None = no preference either way (shown to the traveler as "Either is fine").
    with_driver_preference: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    budget_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    budget_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    bid_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[RideRequestStatus] = mapped_column(
        Enum(RideRequestStatus, name="ride_request_status"), default=RideRequestStatus.OPEN
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    traveler: Mapped["User"] = relationship()  # noqa: F821
    bids: Mapped[list["RideBid"]] = relationship(back_populates="request", cascade="all, delete-orphan")


class RideBid(Base):
    __tablename__ = "ride_bids"
    __table_args__ = (
        UniqueConstraint("request_id", "rent_a_car_role_id", name="uq_ride_bid_per_partner_per_request"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ride_requests.id", ondelete="CASCADE"), index=True
    )
    rent_a_car_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    with_driver: Mapped[bool] = mapped_column(Boolean, default=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[RideBidStatus] = mapped_column(Enum(RideBidStatus, name="ride_bid_status"), default=RideBidStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped["RideRequest"] = relationship(back_populates="bids")
    rent_a_car_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    vehicle: Mapped["Vehicle | None"] = relationship()  # noqa: F821
