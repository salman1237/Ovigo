"""Public partner profiles. One row per approved role — a partner_role can only have
a profile once it's APPROVED (enforced in service.py, not at the DB level, since the
approval workflow itself lives in the partners module and profile creation happens
after)."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821

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
