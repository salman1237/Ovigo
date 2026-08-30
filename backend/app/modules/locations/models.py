"""Location hierarchy: Country -> Region -> City -> Attraction.

Sprint 1-2 scope: base self-referential table only. Full CRUD, search/autocomplete and the
location-tagging junction table (linking tours/stays/profiles to locations) are built in
Sprint 3-4 alongside partner onboarding, which is the first consumer of location tagging.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LocationType(str, enum.Enum):
    COUNTRY = "country"
    REGION = "region"
    CITY = "city"
    ATTRACTION = "attraction"


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
