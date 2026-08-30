"""Verified reviews — gated on a COMPLETED booking item (MVP acceptance criterion
#12: "Only completed bookings generate review eligibility"), enforced in
service.py rather than at the DB level. `tour_id`/`property_id` are denormalized
from the booking item at creation time so listing "reviews for tour X" doesn't
need a join through bookings on every read.

Review replies (partner responding to a review) are in the technical document's
schema but not in this sprint's deliverable list — deferred, not forgotten.
"""
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("booking_item_id", name="uq_review_per_booking_item"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_review_rating_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("booking_items.id", ondelete="CASCADE")
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    tour_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tours.id", ondelete="SET NULL"), nullable=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True
    )
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    booking_item: Mapped["BookingItem"] = relationship(back_populates="reviews")  # noqa: F821
    reviewer: Mapped["User"] = relationship()  # noqa: F821
