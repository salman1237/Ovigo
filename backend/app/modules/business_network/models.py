"""Business referral network (technical document Phase 2, Sprint 12-13, MVP
acceptance criteria #14/#15): a Local Expert can add a business they know —
either one they own/co-own, or a pure referral of someone else's — and Ovigo
records the attribution.

Scope note: this sprint covers the referral record, ownership types, and the
admin approval workflow (satisfies AC #14 "can add a referred business" and
AC #15 "referral attribution is stored"). It deliberately stops short of a
working "network commission engine" — a referred business isn't necessarily a
bookable partner on the platform at all (it might just be a trusted local
recommendation), so there's no booking activity to calculate a referral
commission against yet. The technical document's own Sprint 14-15
("Advanced commission engine — category, partner-specific, referral,
network") is where a referred business that later becomes an actual booking-
generating partner would get connected to its referrer for commission
purposes.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OwnershipType(str, enum.Enum):
    OWNED = "owned"  # the referring expert owns or co-owns this business
    REFERRED = "referred"  # a pure referral of someone else's business


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
    business_type: Mapped[str] = mapped_column(String(100))  # free text: "restaurant", "shop", "transport", ...
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ownership_type: Mapped[OwnershipType] = mapped_column(Enum(OwnershipType, name="ownership_type"))
    status: Mapped[ReferralStatus] = mapped_column(
        Enum(ReferralStatus, name="referral_status"), default=ReferralStatus.PENDING
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    referring_expert_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
