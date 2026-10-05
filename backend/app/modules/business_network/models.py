"""Business referral network (technical document Phase 2, Sprint 12-13, MVP
acceptance criteria #14/#15): a Local Expert can add a business they know —
either one they own/co-own, or a pure referral of someone else's — and Ovigo
records the attribution.

Commission: once an admin links an approved referral to the business's actual
partner role (`linked_partner_role_id`, set by service.py's `link_partner`), a
`NetworkAttribution` (referrals/models.py) is written for it, and from then on
the commission engine credits the referring expert a NETWORK cut of that
partner's bookings for the attribution's commission window. A referral that's
never linked (e.g. a restaurant with nothing bookable on Ovigo) earns nothing,
since there's no booking activity to take a cut of. Partners who join through an
expert's referral link get the same kind of attribution without a
BusinessReferral at all.

Phase 9.4 adds:
- BusinessType enum (12 PRD §12.1 values + OTHER) replacing the old free-text column.
  Existing rows that don't map to a known value are kept in `business_type_note`.
- OwnershipType gains MANAGED, PARTNER and UNVERIFIED_RECOMMENDATION (PRD §12.2).
  UNVERIFIED_RECOMMENDATION is a trust-pending recommendation that can never be
  linked to a partner role or earn commission until it's converted to REFERRED and
  goes through the full approval + invite flow.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BusinessType(str, enum.Enum):
    HOTEL = "hotel"
    RESORT = "resort"
    HOMESTAY = "homestay"
    GUESTHOUSE = "guesthouse"
    RESTAURANT = "restaurant"
    LOCAL_TRANSPORT = "local_transport"
    RENT_A_CAR = "rent_a_car"
    ACTIVITY_PROVIDER = "activity_provider"
    PHOTOGRAPHER = "photographer"
    LOCAL_PRODUCT_BRAND = "local_product_brand"
    EQUIPMENT_RENTAL = "equipment_rental"
    EVENT_CULTURAL = "event_cultural"
    OTHER = "other"


class OwnershipType(str, enum.Enum):
    OWNED = "owned"                                   # expert owns / co-owns
    MANAGED = "managed"                               # expert manages but doesn't own
    REFERRED = "referred"                             # pure referral — sends an owner invite
    PARTNER = "partner"                               # a formal registered Ovigo partner
    UNVERIFIED_RECOMMENDATION = "unverified_recommendation"  # cannot earn commission until converted


class ReferralStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class BusinessReferral(Base):
    __tablename__ = "business_referrals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referring_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    business_name: Mapped[str] = mapped_column(String(255))
    business_type: Mapped[BusinessType] = mapped_column(
        Enum(BusinessType, name="business_type_enum", values_callable=lambda x: [e.value for e in x])
    )
    # Preserves the original free text when the old value didn't map to a BusinessType value,
    # or when the expert selects OTHER and wants to describe the business type further.
    business_type_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ownership_type: Mapped[OwnershipType] = mapped_column(
        Enum(OwnershipType, name="ownership_type", values_callable=lambda x: [e.value for e in x])
    )
    status: Mapped[ReferralStatus] = mapped_column(
        Enum(ReferralStatus, name="referral_status", values_callable=lambda x: [e.value for e in x]),
        default=ReferralStatus.PENDING,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set by an admin once the referred business itself registers as an actual Ovigo
    # partner — linking writes the NetworkAttribution (referrals/models.py) that the
    # commission engine reads; before that there's no booking activity to take a cut of.
    linked_partner_role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    # Owner invitation (REFERRED type only — an OWNED referral's "owner" is the
    # referring expert themself, nothing to invite): a shareable claim link the
    # referring expert sends the actual business owner outside the platform (no
    # email/SMS delivery exists yet — see notifications/models.py), who then visits
    # it and claims the referral as themselves.
    invite_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    invite_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invited_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    invite_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # A distinct step from `status` approval — an admin independently confirming the
    # business is real (a phone call, a site visit, whatever), not just that the
    # referral record itself looks legitimate.
    is_business_verified: Mapped[bool] = mapped_column(default=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Overrides the platform-wide NETWORK commission rate for this specific referral,
    # when a negotiated rate applies instead of the standard one. Mirrored onto the
    # linked NetworkAttribution, which is what the commission engine actually reads.
    custom_commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    referring_expert_role: Mapped["PartnerRole"] = relationship(foreign_keys=[referring_expert_role_id])  # noqa: F821
    linked_partner_role: Mapped["PartnerRole | None"] = relationship(foreign_keys=[linked_partner_role_id])  # noqa: F821
    invited_user: Mapped["User | None"] = relationship(foreign_keys=[invited_user_id])  # noqa: F821
