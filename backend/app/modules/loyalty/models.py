"""Loyalty wallet & reward points (technical document Sprint 27-28: "Loyalty,
Mobile & Platform Maturity"). A traveler earns points on every booking that reaches
`BookingStatus.COMPLETED` — the same trust bar `commissions/service.py` already uses
for paying out partners — and can redeem a balance of points for a BDT discount on a
future booking.

One account per user (`LoyaltyAccount.points_balance` is a denormalized running
total, not something callers sum from the ledger on every read) backed by an
append-only ledger (`LoyaltyTransaction`) that is the actual source of truth for
audit/support purposes — every balance change writes a ledger row in the same
transaction, so the two never drift.

Redemption is modeled exactly like inventory reservation elsewhere in this codebase
(see bookings/service.py): points are deducted up front when a booking is created
(bookings/service.py::create_booking calls `redeem_points`) and refunded if that
booking is later cancelled (`_release_and_cancel` calls `refund_redeemed_points`) —
a user's own earned points are never simply forfeited by a cancellation, unlike a
promotional code's one-time redemption (see promotions/models.py's module docstring
for why that's a deliberate difference).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LoyaltyTransactionReason(str, enum.Enum):
    EARNED = "earned"  # credited when a booking is COMPLETED
    REDEEMED = "redeemed"  # debited when spent on a new booking's discount
    REFUNDED = "refunded"  # credited back when a booking with a redemption is cancelled
    ADMIN_ADJUSTMENT = "admin_adjustment"


class LoyaltyAccount(Base):
    __tablename__ = "loyalty_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    points_balance: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship()  # noqa: F821


class LoyaltyTransaction(Base):
    __tablename__ = "loyalty_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Nullable: an ADMIN_ADJUSTMENT has no booking to point to.
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reason: Mapped[LoyaltyTransactionReason] = mapped_column(Enum(LoyaltyTransactionReason, name="loyalty_transaction_reason"))
    # Positive for EARNED/REFUNDED/a positive ADMIN_ADJUSTMENT, negative for REDEEMED.
    points_delta: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
