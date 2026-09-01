"""Advertising platform (technical document Phase 3, Sprint 17-18): partners pay to
promote one of their own already-published listings (Tour/Property/Vehicle) in search
results, targeted by destination.

Scope trims (consistent with this project's precedent of not building speculative
generality):
- **No separate ad-creative asset.** A campaign promotes an existing, already-approved
  listing rather than a new headline/image pair — "creative approval" here means
  admin approval of the campaign itself (budget, bid, targeting), not a new asset
  review pipeline. The listing's own content was already vetted when it was published.
- **No real payment-gateway integration for ad spend.** `budget_total`/`budget_spent`
  are tracked internally only, the same flag-only pattern already used for payouts
  and escrow release elsewhere in this codebase ("no real bank transfer... a payout
  is marked paid immediately") — there's no reason ad billing should be the one
  exception. A partner sets a budget; spend accrues against it; nothing moves money.
- **No audience/demographic targeting**, only destination targeting (reusing the
  existing generic `location_tags` system via `TaggableEntityType.AD_CAMPAIGN`) —
  there's no traveler profiling data model in this codebase to target against.
- **Impressions/clicks are aggregate counters on the campaign row, not an event log.**
  No per-impression/per-click table — consistent with how this codebase avoids event
  sourcing elsewhere (e.g. commissions/payouts are running balances, not ledgers of
  individual micro-transactions beyond what's needed for attribution).
- **No ROAS in reporting** (impressions/clicks/CTR/spend only) — computing real
  return-on-ad-spend needs click-to-booking attribution, which doesn't exist and
  would be a significant feature on its own, not a reporting nicety.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.locations.models import TaggableEntityType


class AdPlacementType(str, enum.Enum):
    SEARCH = "search"
    FEATURED = "featured"
    BANNER = "banner"
    CARD = "card"
    SPONSORED = "sponsored"


class AdBillingModel(str, enum.Enum):
    CPC = "cpc"  # cost per click — bid_amount is charged per click
    CPM = "cpm"  # cost per mille — bid_amount is charged per 1,000 impressions


class AdCampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    ACTIVE = "active"
    PAUSED = "paused"
    REJECTED = "rejected"
    COMPLETED = "completed"  # budget exhausted or past end_date


class AdCampaign(Base):
    __tablename__ = "ad_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    # What's being advertised — reuses the shared TaggableEntityType enum
    # (locations/models.py) rather than a new one, since campaign targeting reuses
    # the existing location_tags system keyed on that same enum/entity_id pair.
    # Application-level validation restricts this to TOUR/PROPERTY/VEHICLE — the
    # other TaggableEntityType members (PARTNER_ROLE, CUSTOM_TOUR_REQUEST, AD_CAMPAIGN
    # itself) aren't bookable listings and can't be advertised.
    entity_type: Mapped[TaggableEntityType] = mapped_column(Enum(TaggableEntityType, name="taggable_entity_type"))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)

    placement_type: Mapped[AdPlacementType] = mapped_column(Enum(AdPlacementType, name="ad_placement_type"))
    billing_model: Mapped[AdBillingModel] = mapped_column(Enum(AdBillingModel, name="ad_billing_model"))
    bid_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    budget_total: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    budget_spent: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))

    status: Mapped[AdCampaignStatus] = mapped_column(
        Enum(AdCampaignStatus, name="ad_campaign_status"), default=AdCampaignStatus.DRAFT
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    impressions_count: Mapped[int] = mapped_column(Integer, default=0)
    clicks_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
