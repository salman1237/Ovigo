"""Homepage content management. An admin can edit every piece of homepage copy,
the hero/promo-banner images, which specific tours/properties get featured, and
the "explore by category" tiles — all without a code change or redeploy.

`HomepageSettings` is a single row (created with today's actual live copy as its
defaults on first read — see service.py's get-or-create, matching the same pattern
as esim/models.py's `EsimPricingConfig`), so nothing on the live site changes until
an admin actually edits something. Image fields are nullable storage keys (same
S3-compatible storage as tour/property images, core/storage.py) — a null hero/banner
image means "use the current fallback" (the frontend keeps deriving a hero image
from the top destination, and a plain gradient for the banner, exactly as before
this module existed) rather than showing a broken image.

`FeaturedListing` lets an admin pin specific tours/properties to the homepage in a
specific order; if none are pinned for a given type, the homepage falls back to
its previous behavior (the first few published listings) — same safe, additive,
never-breaks-what-already-works rollout this codebase uses everywhere else.
`entity_type` reuses `TaggableEntityType` (restricted to TOUR/PROPERTY at the
application level) rather than a new enum, the same trade-off `ads/models.py`
already made for the same reason.

`CategoryTile` is a fully admin-managed ordered list (add/edit/remove/reorder) —
seeded with today's 4 tiles (Tours/Stays/Rent a Car/eSIM) the first time it's read
empty, then entirely under admin control from that point on.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.locations.models import TaggableEntityType


class HomepageSettings(Base):
    __tablename__ = "homepage_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    hero_badge_text: Mapped[str] = mapped_column(String(255), default="Local experts, hosts & rentals — one marketplace")
    hero_headline: Mapped[str] = mapped_column(String(255), default="Welcome to Ovigo")
    hero_subheadline: Mapped[str] = mapped_column(
        Text,
        default=(
            "Discover verified local experts, hosts and rent-a-car partners by destination — "
            "every listing is admin-approved before it ever reaches you."
        ),
    )
    hero_image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hero_image_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    destinations_heading: Mapped[str] = mapped_column(String(255), default="Most popular destinations")
    destinations_subheading: Mapped[str] = mapped_column(String(500), default="Real listings, ready to book today.")

    tours_heading: Mapped[str] = mapped_column(String(255), default="Featured tours")
    tours_subheading: Mapped[str] = mapped_column(String(500), default="Fixed-date itineraries led by verified local experts.")

    stays_heading: Mapped[str] = mapped_column(String(255), default="Best stays for your next trip")
    stays_subheading: Mapped[str] = mapped_column(String(500), default="Hotels, resorts and homestays, booked directly from the host.")

    banner_heading: Mapped[str] = mapped_column(String(255), default="Grow your business with Ovigo")
    banner_text: Mapped[str] = mapped_column(
        Text,
        default=(
            "List your tours, stays or vehicles and reach travelers actively looking to book — "
            "every listing goes through a real admin review, not an anonymous ad."
        ),
    )
    banner_cta_label: Mapped[str] = mapped_column(String(100), default="Become a Partner")
    banner_cta_link: Mapped[str] = mapped_column(String(500), default="/account/partner")
    banner_image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banner_image_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    category_heading: Mapped[str] = mapped_column(String(255), default="Explore by category")
    category_subheading: Mapped[str] = mapped_column(
        String(500), default="Every listing is tied to a verified, admin-approved partner — not an anonymous ad."
    )

    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FeaturedListing(Base):
    __tablename__ = "featured_listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[TaggableEntityType] = mapped_column(Enum(TaggableEntityType, name="taggable_entity_type"))
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CategoryTile(Base):
    __tablename__ = "category_tiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(100))
    subtitle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    link: Mapped[str] = mapped_column(String(500))
    image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    image_content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Fallback background when no image is set — hex colors for a CSS gradient.
    gradient_from: Mapped[str] = mapped_column(String(20), default="#3b82f6")
    gradient_to: Mapped[str] = mapped_column(String(20), default="#4338ca")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
