"""Payout batching (technical document Phase 2, Sprint 14-15). One `Payout` row
per partner per batch run, summing every PAYABLE `Commission` (DIRECT and
NETWORK alike) they're owed at that moment. Like every other financial feature
so far (escrow release, dispute refunds), there's no real bank transfer or
gateway integration behind this — an admin manually walks each payout through
its lifecycle (PENDING -> PROCESSING -> PAID, or -> FAILED/REVERSED if the
transfer didn't actually land) once they've sent it over whatever rail they
used out of band. Wiring an actual disbursement rail (bKash payout API, bank
transfer file export, ...) is real infrastructure work with no corresponding
sprint bullet yet; this module gets the eligibility/batching/status-tracking
shape right so that plugging a real rail in later is a matter of an admin's
manual status update becoming an automated webhook, not restructuring the
ledger.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PayoutStatus(str, enum.Enum):
    PENDING = "pending"  # batch created; transfer not yet sent
    PROCESSING = "processing"  # admin has initiated the transfer out of band
    PAID = "paid"  # confirmed received by the partner
    FAILED = "failed"  # transfer failed before reaching the partner
    REVERSED = "reversed"  # a previously PAID payout bounced back / was clawed back

    # FAILED and REVERSED both mean the partner never actually kept the money —
    # run_payout_batch's commission-status flip gets undone for either one so
    # those commissions are swept into the next batch instead of being stuck.


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    commission_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[PayoutStatus] = mapped_column(
        Enum(PayoutStatus, name="payout_status"), default=PayoutStatus.PENDING
    )
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
