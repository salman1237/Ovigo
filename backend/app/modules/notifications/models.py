"""In-app notifications only for now. Email/SMS/push delivery (technical document
§18) needs a provider credential (SendGrid/SES, Twilio, FCM) that isn't configured
yet — `service.notify()` is written so wiring those in later is a matter of adding
a delivery branch there, not touching any of the ~15 call sites that create
notifications today.

Sprint 21-22 Part 2b adds `NotificationTemplate` (a reusable subject/body pair) and
`NotificationCampaign` (an admin-triggered broadcast to a chosen audience) — the
"Notification templates & campaign tools" and "emergency alerts" line items from
the technical document's admin dashboard section. Every campaign is delivered
through the exact same in-app `Notification` rows as every other notification in
this codebase — there's no separate broadcast mechanism, and no push/SMS delivery
for the same provider-credential reason noted above, so `is_urgent` is a display
flag only (surfaced in the UI), not an actual out-of-band emergency channel. A
campaign's `title`/`message` are snapshotted from the template at send time (or
given ad-hoc) rather than referencing it live, so editing or deleting a template
later never changes what a past campaign is recorded as having sent.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class NotificationType(str, enum.Enum):
    BOOKING_CONFIRMED = "booking_confirmed"
    BOOKING_CANCELLED = "booking_cancelled"
    BOOKING_COMPLETED = "booking_completed"
    PAYMENT_FAILED = "payment_failed"
    ROLE_APPROVED = "role_approved"
    ROLE_REJECTED = "role_rejected"
    DOCUMENT_VERIFIED = "document_verified"
    DOCUMENT_REJECTED = "document_rejected"
    LISTING_APPROVED = "listing_approved"
    LISTING_REJECTED = "listing_rejected"
    NEW_REVIEW = "new_review"
    DISPUTE_OPENED = "dispute_opened"
    DISPUTE_RESOLVED = "dispute_resolved"
    NEW_BID = "new_bid"
    BID_ACCEPTED = "bid_accepted"
    BID_REJECTED = "bid_rejected"
    GUIDE_INVITE = "guide_invite"
    GUIDE_SUPERVISION_ACCEPTED = "guide_supervision_accepted"
    GUIDE_SUPERVISION_ENDED = "guide_supervision_ended"
    GUIDE_ASSIGNED = "guide_assigned"
    REFERRAL_APPROVED = "referral_approved"
    REFERRAL_REJECTED = "referral_rejected"
    PAYOUT_PROCESSED = "payout_processed"
    BADGE_APPROVED = "badge_approved"
    BADGE_REJECTED = "badge_rejected"
    BADGE_AUTO_AWARDED = "badge_auto_awarded"
    NEW_CHAT_MESSAGE = "new_chat_message"
    CHAT_MESSAGE_REPORTED = "chat_message_reported"
    STAFF_INVITE = "staff_invite"
    FRAUD_ALERT = "fraud_alert"
    ADMIN_ANNOUNCEMENT = "admin_announcement"


class CampaignAudience(str, enum.Enum):
    ALL_USERS = "all_users"
    TRAVELERS_ONLY = "travelers_only"  # users with no partner account at all
    PARTNERS_ONLY = "partners_only"  # users with a partner account; optionally narrowed by role_type


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType, name="notification_type"))
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship()  # noqa: F821


class NotificationTemplate(Base):
    __tablename__ = "notification_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    subject: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NotificationCampaign(Base):
    __tablename__ = "notification_campaigns"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("notification_templates.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    audience: Mapped[CampaignAudience] = mapped_column(Enum(CampaignAudience, name="campaign_audience"))
    audience_role_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    recipient_count: Mapped[int] = mapped_column(Integer)
    sent_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    template: Mapped["NotificationTemplate | None"] = relationship()
    sent_by: Mapped["User | None"] = relationship()  # noqa: F821
