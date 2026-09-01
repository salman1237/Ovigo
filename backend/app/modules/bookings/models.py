"""Unified booking engine: one Booking can hold multiple BookingItems (a tour
departure, a stay, or both), each with its own service-level status so e.g. a tour
can be marked complete independently of an attached stay (technical document §10.2).

Currency: BDT only for now — this is a Bangladesh-focused marketplace and every
price field elsewhere (tour base_price, room_type base_price, ...) is already an
undated plain Decimal with no currency column, so there's nothing to convert.
Multi-currency is explicitly a later phase in the technical document.
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
