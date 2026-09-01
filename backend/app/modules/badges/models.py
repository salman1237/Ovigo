"""Trust badges & certifications (technical document Phase 2, Sprint 14-15).
Badges attach to the same three entity kinds tours/properties/partner roles
already use for location tagging (locations/models.py's `TaggableEntityType`)
— reused here rather than duplicated, since it's the same underlying "entity
kind" concept, just a different attribute being attached.

COUPLE_FRIENDLY is the "privacy-protected" badge logic the sprint calls out:
the applicant's `private_note` (whatever context they give the admin to
justify the badge) and any `rejection_reason` are never serialized in a
public-facing schema — only the boolean fact "this property holds this
badge" is ever public. This matters specifically for this badge because the
justification a host might give (why they welcome unmarried couples, in a
market where many properties don't) is exactly the kind of detail that
shouldn't be searchable or displayed.

TOP_RATED is the one auto-awarded badge type — reviews/service.py recomputes
it after every new review rather than a partner applying for it manually.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.locations.models import TaggableEntityType


class BadgeType(str, enum.Enum):
    VERIFIED = "verified"
    TOP_RATED = "top_rated"
    COUPLE_FRIENDLY = "couple_friendly"
    SAFETY_CERTIFIED = "safety_certified"


class BadgeStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Badge(Base):
    __tablename__ = "badges"
    __table_args__ = (UniqueConstraint("entity_type", "entity_id", "badge_type", name="uq_badge_per_entity_type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[TaggableEntityType] = mapped_column(Enum(TaggableEntityType, name="taggable_entity_type"))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    badge_type: Mapped[BadgeType] = mapped_column(Enum(BadgeType, name="badge_type"))
    status: Mapped[BadgeStatus] = mapped_column(Enum(BadgeStatus, name="badge_status"), default=BadgeStatus.PENDING)
    is_auto_awarded: Mapped[bool] = mapped_column(Boolean, default=False)
    applied_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    private_note: Mapped[str | None] = mapped_column(Text, nullable=True)  # never exposed publicly
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)  # never exposed publicly
    awarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    applied_by: Mapped["User | None"] = relationship()  # noqa: F821
