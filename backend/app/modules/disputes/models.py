"""Disputes: either party to a booking — the traveler, or any partner serving one of
its items — can flag a problem; an admin resolves it with a refund or a rejection.

Sprint 16 Part 2 closed the "payout holds" half of MVP AC #16 ("Admin can manage
disputes, refunds and payout holds"): opening a dispute now freezes every Commission
tied to the booking (ON_HOLD, see commissions/models.py), so a partner can't get paid
out while a dispute is unresolved. Resolving as REJECTED releases the hold back to
PENDING/PAYABLE; resolving as REFUNDED cancels those commissions outright (CANCELLED)
since the partner isn't owed anything on a refunded booking. A refund itself still
only flips the associated EscrowTransaction to REFUNDED (a bookkeeping flag, same as
"release" does today) — no money actually moves since there's no payout/refund
gateway integration; that stays out of scope.

Scope trim: resolution is still binary (full refund or rejected) — no partial-refund
amount tracking, since escrow is a single HELD/REFUNDED flag per booking, not an
amount-tracked ledger. There's also no dedicated "disputes I'm involved in" endpoint
for partners yet (would need scanning bookings by resolved partner-role ownership) —
partners are still notified in-app the moment a dispute opens or resolves on a
booking of theirs, they just don't have a list view to browse history from.
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

    @property
    def raised_by_role(self) -> str:
        """"traveler" or "partner" — computed from the loaded `booking` relationship
        rather than stored, since it's fully derived from who raised it vs. who the
        booking belongs to. Callers must eager-load `booking` (see service.py's
        `_EAGER`) or this raises a lazy-load error in an async context."""
        return "traveler" if self.raised_by_id == self.booking.user_id else "partner"
