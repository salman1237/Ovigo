"""Basic disputes: a traveler flags a problem with a booking, an admin resolves it
with an optional refund. This satisfies MVP AC #16 ("Admin can manage disputes,
refunds and payout holds") at the level Phase 1 needs — a refund here only flips
the associated EscrowTransaction to REFUNDED (a bookkeeping flag, same as
"release" does today); no money actually moves since there's no payout/refund
API integration yet. Real gateway-side refunds are Phase 2+ scope.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DisputeStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"


class DisputeResolution(str, enum.Enum):
    REFUNDED = "refunded"
    REJECTED = "rejected"


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    raised_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[DisputeStatus] = mapped_column(Enum(DisputeStatus, name="dispute_status"), default=DisputeStatus.OPEN)
    resolution: Mapped[DisputeResolution | None] = mapped_column(
        Enum(DisputeResolution, name="dispute_resolution"), nullable=True
    )
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    booking: Mapped["Booking"] = relationship()  # noqa: F821
    raised_by: Mapped["User"] = relationship(foreign_keys=[raised_by_id])  # noqa: F821
