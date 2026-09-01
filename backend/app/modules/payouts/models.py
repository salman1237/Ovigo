"""Payout batching (technical document Phase 2, Sprint 14-15). One `Payout` row
per partner per batch run, summing every PAYABLE `Commission` (DIRECT and
NETWORK alike) they're owed at that moment. Like every other financial feature
so far (escrow release, dispute refunds), there's no real bank transfer or
gateway integration behind this — running a batch marks the payout PAID
immediately. Wiring an actual disbursement rail (bKash payout API, bank
transfer file export, ...) is real infrastructure work with no corresponding
sprint bullet yet; this module gets the eligibility/batching/status-tracking
shape right so that plugging a real rail in later is a matter of adding a
transfer step between "batch created" and "marked paid", not restructuring
the ledger.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PayoutStatus(str, enum.Enum):
    PAID = "paid"  # the only status reachable today — see module docstring


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    commission_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[PayoutStatus] = mapped_column(Enum(PayoutStatus, name="payout_status"), default=PayoutStatus.PAID)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
