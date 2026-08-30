"""Custom tour bidding (technical document Phase 2, Sprint 10-11): a traveler
posts a custom tour request (destination, dates, group size, budget); any Local
Expert whose tagged locations cover that destination can submit a bid (price +
day-by-day itinerary); the traveler compares bids and accepts one.

Accepting a bid converts it straight into a real booking (see
bookings/service.py's create_booking_from_bid) — bidding-to-booking reuses the
entire existing payment/commission/escrow/notification pipeline via
BookingItemType.CUSTOM_BID rather than building a parallel one.

Bid itinerary is stored as JSONB rather than its own child table (unlike Tour's
TourItineraryDay) — it's a point-in-time snapshot attached to one bid, never
edited or queried independently, so a relational table would only add
migration overhead for no query benefit.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
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
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RequestStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"  # a bid was accepted
    CANCELLED = "cancelled"  # traveler cancelled before accepting any bid


class BidStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"  # a different bid on the same request was accepted
    WITHDRAWN = "withdrawn"  # the expert pulled it back


class CustomTourRequest(Base):
    __tablename__ = "custom_tour_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    traveler_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    group_size: Mapped[int] = mapped_column(Integer, default=1)
    budget_min: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    budget_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"), default=RequestStatus.OPEN
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    traveler: Mapped["User"] = relationship()  # noqa: F821
    bids: Mapped[list["TourBid"]] = relationship(back_populates="request", cascade="all, delete-orphan")


class TourBid(Base):
    __tablename__ = "tour_bids"
    __table_args__ = (
        UniqueConstraint("request_id", "local_expert_role_id", name="uq_bid_per_expert_per_request"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("custom_tour_requests.id", ondelete="CASCADE"), index=True
    )
    local_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    itinerary: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    status: Mapped[BidStatus] = mapped_column(Enum(BidStatus, name="bid_status"), default=BidStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped["CustomTourRequest"] = relationship(back_populates="bids")
    local_expert_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
