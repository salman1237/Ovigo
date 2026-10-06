"""Public partner profiles. One row per approved role — a partner_role can only have
a profile once it's APPROVED (enforced in service.py, not at the DB level, since the
approval workflow itself lives in the partners module and profile creation happens
after).

Fulfills PRD Section 8.2 (Local Expert Public Profile) & Section 7.2.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LocalExpertProfile(Base):
    __tablename__ = "local_expert_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), unique=True
    )
    headline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    languages: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    photo_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # PRD Section 8.2 & 7.2 Local Expert Profile fields
    primary_destination_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    secondary_destinations: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    expertise_categories: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    security_verification_status: Mapped[str] = mapped_column(String(50), default="verified")
    emergency_handling_capability: Mapped[bool] = mapped_column(Boolean, default=True)
    emergency_contact_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    rating_avg: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("5.00"))
    reviews_count: Mapped[int] = mapped_column(Integer, default=0)
    total_tours_conducted: Mapped[int] = mapped_column(Integer, default=0)
    response_rate_percent: Mapped[int] = mapped_column(Integer, default=100)
    completion_rate_percent: Mapped[int] = mapped_column(Integer, default=100)
    cancellation_rate_percent: Mapped[int] = mapped_column(Integer, default=0)
    badge_level: Mapped[str] = mapped_column(String(50), default="Verified Expert")
    # Admin-set trust flag. When True and the tour has no high-risk activities,
    # submit_for_review auto-publishes the tour instead of queuing it for review.
    is_trusted: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    primary_destination: Mapped["Location | None"] = relationship(foreign_keys=[primary_destination_id])  # noqa: F821

    @property
    def has_photo(self) -> bool:
        return self.photo_key is not None


class HostProfile(Base):
    __tablename__ = "host_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), unique=True
    )
    business_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    photo_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821

    @property
    def has_photo(self) -> bool:
        return self.photo_key is not None
