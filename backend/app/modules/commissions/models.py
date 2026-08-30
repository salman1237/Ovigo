"""Commission calculation only — no payout/disbursement here. Payouts (batching,
bank transfer, payout status tracking) are Phase 2 "Financial Engine" work per the
technical document's own phase plan; this table just records what Ovigo is owed
per booking item once a booking is paid, so a partner's dashboard has real numbers
to show and Phase 2 has something to pay out against.

Rates are a flat global-by-item-type constant for now (see service.py), not a
configurable `commission_rules` table with partner-specific overrides — that's
explicitly the Phase 2 "Advanced commission engine" scope (category, partner-
specific, referral, network rates with priority resolution).
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CommissionStatus(str, enum.Enum):
    PENDING = "pending"  # booking item not yet completed
    PAYABLE = "payable"  # completed, owed to the partner (payout is Phase 2)


class Commission(Base):
    __tablename__ = "commissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("booking_items.id", ondelete="CASCADE"), unique=True
    )
    partner_role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"))
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 4))  # e.g. 0.1000 = 10%
    commission_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    partner_net_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[CommissionStatus] = mapped_column(
        Enum(CommissionStatus, name="commission_status"), default=CommissionStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    booking_item: Mapped["BookingItem"] = relationship()  # noqa: F821
    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
