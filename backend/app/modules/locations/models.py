"""Location hierarchy: Country -> Region -> City -> Attraction, plus generic location tagging.

Sprint 1-2 scope was the base self-referential table only. Sprint 3-4 adds full CRUD,
search, and `location_tags` — a generic junction so any future entity (partner role,
tour, property, ...) can be tagged to one or more locations without a new table per
entity type. Partner roles are the first consumer (§3.5 "Publishing Restriction" — a
role's public profile can't go live without at least one tagged location).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LocationType(str, enum.Enum):
    COUNTRY = "country"
    REGION = "region"
    CITY = "city"
    ATTRACTION = "attraction"


class TaggableEntityType(str, enum.Enum):
    """Entity kinds that can be tagged to a location."""

    PARTNER_ROLE = "partner_role"
    TOUR = "tour"
    PROPERTY = "property"


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    type: Mapped[LocationType] = mapped_column(Enum(LocationType, name="location_type"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True
    )
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    is_publishable: Mapped[bool] = mapped_column(default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    children: Mapped[list["Location"]] = relationship("Location", back_populates="parent")
    parent: Mapped["Location | None"] = relationship(
        "Location", back_populates="children", remote_side=[id]
    )


class LocationTag(Base):
    __tablename__ = "location_tags"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "location_id", name="uq_location_tag"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[TaggableEntityType] = mapped_column(Enum(TaggableEntityType, name="taggable_entity_type"))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    location: Mapped["Location"] = relationship("Location")
