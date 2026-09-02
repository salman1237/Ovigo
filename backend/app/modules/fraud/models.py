"""Fraud & Risk (technical document Sprint 21-22): every `FraudFlag` targets exactly
one `User` account, even when the signal was detected via a Booking/Review/
BusinessReferral/PartnerDocument — the admin dashboard's "risk scores" (§7.3 User
Management) are per-user, so keeping the model user-centric avoids needing a generic
entity_type/entity_id indirection just to sum a score back to a person.

A user's risk score is *not* a stored column — it's `sum(score) over OPEN flags for
that user`, computed on read (see `service.get_user_risk_score`), the same
derive-don't-store convention already used for analytics/commission aggregates
elsewhere in this codebase. A flag moving to RESOLVED/DISMISSED drops out of the sum
without needing to touch the user row at all.

Rules are deliberately scoped to signals this schema can actually verify — no device
fingerprint, IP address, or geolocation data is collected anywhere in this codebase,
so "duplicate accounts" can't be detected by those means. Instead:
- **self_booking** / **self_review** / **self_referral** — a partner transacting
  with, reviewing, or being credited a referral for *their own* listing/business,
  detected by comparing the acting User to the listing/business owner's User via the
  existing PartnerRole → PartnerAccount → User chain. These fire in real time, inline
  in the triggering module (bookings/reviews/business_network's service.py), since
  each is a single-event check against data already in hand at that moment.
- **rapid_cancellation_pattern** — a user with several cancelled bookings in a short
  window, also checked inline whenever a booking is cancelled.
- **duplicate_identity_document** — the one rule that's inherently cross-account
  (comparing every partner's uploaded ID document against every other's) rather than
  reactable to a single event, so it stays an admin-triggered batch scan
  (`POST /api/v1/admin/fraud/scan-documents`) instead of a real-time hook.

`context_id` + `rule_type` + `user_id` is unique so re-running a scan (or the same
event firing twice) never creates duplicate flags for the same underlying evidence.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FraudRuleType(str, enum.Enum):
    DUPLICATE_IDENTITY_DOCUMENT = "duplicate_identity_document"
    SELF_REFERRAL = "self_referral"
    SELF_REVIEW = "self_review"
    SELF_BOOKING = "self_booking"
    RAPID_CANCELLATION_PATTERN = "rapid_cancellation_pattern"


class FraudSeverity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FraudFlagStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class FraudFlag(Base):
    __tablename__ = "fraud_flags"
    __table_args__ = (UniqueConstraint("user_id", "rule_type", "context_id", name="uq_fraud_flag_dedupe"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rule_type: Mapped[FraudRuleType] = mapped_column(Enum(FraudRuleType, name="fraud_rule_type"))
    severity: Mapped[FraudSeverity] = mapped_column(Enum(FraudSeverity, name="fraud_severity"))
    score: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    # The specific booking/review/referral/other-user id that triggered this flag, for
    # dedup and admin drill-down. Deliberately not a typed FK — the referenced table
    # varies by rule_type, same trade-off as e.g. LocationTag.entity_id elsewhere.
    context_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[FraudFlagStatus] = mapped_column(Enum(FraudFlagStatus, name="fraud_flag_status"), default=FraudFlagStatus.OPEN)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])  # noqa: F821
