"""Expert referral links and network attribution (PRD §5.2, §12.4, §12.5, §25.4;
PRD_10_12_IMPLEMENTATION_PLAN.md Phase 9.1).

Every approved Local Expert gets one shareable `ExpertReferralLink`. A Guide,
Host, Hotel or Rent-a-Car operator who joins Ovigo through it gets a
`NetworkAttribution` tying their partner role to that expert — the single
source of truth the commission engine reads (commissions/service.py) to credit
the expert a NETWORK commission on that partner's bookings. A business-network
referral that an admin links to a real partner (business_network/service.py's
`link_partner`) writes the same kind of row, so both entry points feed one
table and one commission rule.

Rules worth knowing before changing anything here:
- **First touch wins.** `referred_partner_role_id` is unique, so a partner role
  has at most one referrer for life; only an admin can reassign it.
- **One level deep.** A LOCAL_EXPERT role can never be referred (no expert
  earning on another expert's referrals), which also rules out most circular
  arrangements structurally; referrals/service.py blocks the remaining
  reciprocal case explicitly.
- **Time-limited.** Commission only accrues inside
  [commission_starts_at, commission_expires_at), set when an admin approves the
  referred role. Expiry is evaluated at read time rather than flipped by a cron,
  matching how document and badge expiry already work in this codebase — an
  ACTIVE row past its expiry is reported as "expired" by the API.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.users.models import PartnerRoleType


class AttributionSource(str, enum.Enum):
    REFERRAL_LINK = "referral_link"  # joined through the expert's referral link
    BUSINESS_REFERRAL = "business_referral"  # an approved BusinessReferral linked to this partner by an admin
    ADMIN = "admin"  # created or reassigned by an admin
    GUIDE_INVITE = "guide_invite"  # the expert invited this guide (guides/service.py::invite_guide)


class AttributionStatus(str, enum.Enum):
    PENDING = "pending"  # the referred role hasn't been approved yet
    ACTIVE = "active"  # earning, within its commission window
    REJECTED = "rejected"  # the referred role's application was rejected
    REVOKED = "revoked"  # stopped by an admin (e.g. fraud)


class ExpertReferralLink(Base):
    __tablename__ = "expert_referral_links"
    __table_args__ = (
        # One live link per expert; regenerating deactivates the old row instead of
        # deleting it, so attributions made through an old code still point somewhere.
        Index(
            "uq_expert_referral_links_active_expert",
            "expert_role_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(16), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    visit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    expert_role: Mapped["PartnerRole"] = relationship()  # noqa: F821


class NetworkAttribution(Base):
    __tablename__ = "network_attributions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referring_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    referred_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    referred_partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), unique=True
    )
    role_type: Mapped[PartnerRoleType] = mapped_column(Enum(PartnerRoleType, name="partner_role_type"))
    source: Mapped[AttributionSource] = mapped_column(Enum(AttributionSource, name="network_attribution_source"))
    referral_link_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("expert_referral_links.id", ondelete="SET NULL"), nullable=True
    )
    business_referral_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_referrals.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[AttributionStatus] = mapped_column(
        Enum(AttributionStatus, name="network_attribution_status"), default=AttributionStatus.PENDING
    )
    # Overrides the NETWORK-scope CommissionRule rate for this one attribution. Still
    # capped at Ovigo's own DIRECT commission on each item at calculation time.
    custom_commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    commission_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    commission_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The referred partner accepting the network terms when joining through a link
    # (PRD §12.3 "Commission terms are accepted"). Null for backfilled/admin rows.
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    terms_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    referring_expert_role: Mapped["PartnerRole"] = relationship(foreign_keys=[referring_expert_role_id])  # noqa: F821
    referred_partner_role: Mapped["PartnerRole"] = relationship(foreign_keys=[referred_partner_role_id])  # noqa: F821
    referred_user: Mapped["User"] = relationship(foreign_keys=[referred_user_id])  # noqa: F821
