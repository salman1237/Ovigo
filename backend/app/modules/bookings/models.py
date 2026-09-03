"""Unified booking engine: one Booking can hold multiple BookingItems (a tour
departure, a stay, or both), each with its own service-level status so e.g. a tour
can be marked complete independently of an attached stay (technical document §10.2).

Currency: BDT only for now — this is a Bangladesh-focused marketplace and every
price field elsewhere (tour base_price, room_type base_price, ...) is already an
undated plain Decimal with no currency column, so there's nothing to convert.
Sprint 25-26 added a display-only currency converter for browsing (see
core/fx.py) — every booking here is still charged and settled in BDT.

Sprint 25-26 ("Dynamic packaging" in the technical document's phase plan) adds
`bundle_discount_amount`: a booking spanning 2+ distinct bookable item types
(tour + stay, tour + vehicle, stay + vehicle, or all three) gets an automatic
percentage discount off its total — see bookings/service.py::create_booking for
the exact rates. Deliberate design: the discount is subtracted from
`total_amount` only, never from any `BookingItem.subtotal` — so
`Commission.gross_amount`/`commission_amount` (both derived from `subtotal`,
see stays/models.py's docstring on the same principle for tax/service charges)
are computed on the *full, undiscounted* price. Partners are paid in full;
Ovigo's own commission margin absorbs the discount. The math still balances:
what's actually collected from the traveler (`total_amount`, post-discount)
always equals the sum of every item's `partner_net_amount` plus Ovigo's
(now-reduced) commission take — there's no shortfall, Ovigo is simply choosing
to keep less per bundled booking to make the bundle attractive.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BookingStatus(str, enum.Enum):
    PENDING_PAYMENT = "pending_payment"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class BookingItemType(str, enum.Enum):
    TOUR_DEPARTURE = "tour_departure"
    ROOM_TYPE = "room_type"
    CUSTOM_BID = "custom_bid"
    VEHICLE_RENTAL = "vehicle_rental"


class BookingItemStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status"), default=BookingStatus.PENDING_PAYMENT
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    # Included in total_amount, broken out for display only — the portion of the total
    # that's a property's tax/service charge on a room booking (Sprint 19-20), not
    # room revenue. Deliberately not part of any BookingItem.subtotal since
    # Commission.gross_amount is derived from subtotal (see stays/models.py docstring).
    tax_service_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    # Subtracted from total_amount, broken out for display only — see module
    # docstring for why this comes out of Ovigo's own commission margin rather
    # than any BookingItem.subtotal.
    bundle_discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="BDT")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship()  # noqa: F821
    items: Mapped[list["BookingItem"]] = relationship(back_populates="booking", cascade="all, delete-orphan")
    guests: Mapped[list["BookingGuest"]] = relationship(back_populates="booking", cascade="all, delete-orphan")
    status_history: Mapped[list["BookingStatusHistory"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="BookingStatusHistory.created_at"
    )


class BookingItem(Base):
    __tablename__ = "booking_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    item_type: Mapped[BookingItemType] = mapped_column(Enum(BookingItemType, name="booking_item_type"))
    status: Mapped[BookingItemStatus] = mapped_column(
        Enum(BookingItemStatus, name="booking_item_status"), default=BookingItemStatus.CONFIRMED
    )

    tour_departure_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tour_departures.id", ondelete="SET NULL"), nullable=True
    )
    room_type_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("room_types.id", ondelete="SET NULL"), nullable=True
    )
    # Optional, front-desk-only convenience (Sprint 19-20 Part 2) — which physical Room
    # a staff member assigned to this stay. Doesn't gate or affect inventory counting;
    # see stays/models.py's module docstring.
    assigned_room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    custom_bid_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tour_bids.id", ondelete="SET NULL"), nullable=True
    )
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True
    )
    # check_in_date/check_out_date double as pickup/return dates for a vehicle
    # rental — same date-range shape as a stay, no need for separate columns.
    check_in_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    check_out_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    booking: Mapped["Booking"] = relationship(back_populates="items")
    tour_departure: Mapped["TourDeparture | None"] = relationship()  # noqa: F821
    room_type: Mapped["RoomType | None"] = relationship()  # noqa: F821
    assigned_room: Mapped["Room | None"] = relationship()  # noqa: F821
    reviews: Mapped[list["Review"]] = relationship(back_populates="booking_item")  # noqa: F821


class BookingGuest(Base):
    __tablename__ = "booking_guests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"))
    full_name: Mapped[str] = mapped_column(String(255))
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    id_document: Mapped[str | None] = mapped_column(String(100), nullable=True)

    booking: Mapped["Booking"] = relationship(back_populates="guests")


class BookingStatusHistory(Base):
    __tablename__ = "booking_status_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"))
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    booking: Mapped["Booking"] = relationship(back_populates="status_history")
