"""In-app notifications only for now. Email/SMS/push delivery (technical document
§18) needs a provider credential (SendGrid/SES, Twilio, FCM) that isn't configured
yet — `service.notify()` is written so wiring those in later is a matter of adding
a delivery branch there, not touching any of the ~15 call sites that create
notifications today.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
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
