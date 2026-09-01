"""Commission calculation, now with a configurable rules engine (Phase 2 Sprint
14-15 "Advanced commission engine"). Replaces the flat hardcoded per-item-type
rate from Phase 1 with a `CommissionRule` table resolved by priority: a
PARTNER-scoped rule (an override for one specific partner) always wins over a
CATEGORY-scoped rule (the default rate for a booking-item type), which is
itself just a DB row now instead of a Python constant.

"Referral"/"network" commission (the doc lists both under "advanced commission
engine") is modeled as one concept here: when a booking item's partner was
introduced to Ovigo through an *approved* `BusinessReferral` that has since
been linked to their actual `PartnerRole` (business_network/models.py's
`linked_partner_role_id`), the referring Local Expert earns an additional cut
— a second Commission row on the same booking item, `source=NETWORK`, at the
platform-wide NETWORK-scope rate. This is additive to (not a replacement of)
the partner's own DIRECT commission, which is why `booking_item_id` is no
longer unique on this table — a single booking item can now generate two
Commission rows (one DIRECT, one NETWORK) instead of exactly one.

Payout batching lives in the separate `payouts` module (matching the technical
document's own `/api/v1/payouts` base path) — this module only tracks a
nullable `payout_id` on each Commission row, set once it's been swept into a
batch.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.bookings.models import BookingItemType


class CommissionStatus(str, enum.Enum):
    PENDING = "pending"  # booking item not yet completed
    PAYABLE = "payable"  # completed, owed to the partner
    PAID = "paid"  # swept into a payout batch
    ON_HOLD = "on_hold"  # frozen by an open dispute on the booking — a payout hold
    CANCELLED = "cancelled"  # the booking was refunded following a dispute; no commission is owed


class CommissionSource(str, enum.Enum):
    DIRECT = "direct"  # the partner's own earning on their booking item
    NETWORK = "network"  # a referring expert's cut of someone else's booking item


class CommissionRuleScope(str, enum.Enum):
    CATEGORY = "category"  # default rate for a BookingItemType
    PARTNER = "partner"  # override for one specific partner_role_id
    NETWORK = "network"  # the referral/network cut rate (platform-wide)


class CommissionRule(Base):
    __tablename__ = "commission_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scope: Mapped[CommissionRuleScope] = mapped_column(Enum(CommissionRuleScope, name="commission_rule_scope"))
    item_type: Mapped[BookingItemType | None] = mapped_column(
        Enum(BookingItemType, name="booking_item_type"), nullable=True
    )
    partner_role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), nullable=True
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole | None"] = relationship()  # noqa: F821


class Commission(Base):
    __tablename__ = "commissions"
    __table_args__ = (
        UniqueConstraint("booking_item_id", "partner_role_id", "source", name="uq_commission_per_item_partner_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("booking_items.id", ondelete="CASCADE"), index=True
    )
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[CommissionSource] = mapped_column(
        Enum(CommissionSource, name="commission_source"), default=CommissionSource.DIRECT
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commission_rules.id", ondelete="SET NULL"), nullable=True
    )
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    rate: Mapped[Decimal] = mapped_column(Numeric(5, 4))  # e.g. 0.1000 = 10%
    commission_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    partner_net_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[CommissionStatus] = mapped_column(
        Enum(CommissionStatus, name="commission_status"), default=CommissionStatus.PENDING
    )
    payout_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("payouts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    booking_item: Mapped["BookingItem"] = relationship()  # noqa: F821
    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
