import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class HomepageSettingsRead(BaseModel):
    hero_badge_text: str
    hero_headline: str
    hero_subheadline: str
    has_hero_image: bool
    destinations_heading: str
    destinations_subheading: str
    tours_heading: str
    tours_subheading: str
    stays_heading: str
    stays_subheading: str
    banner_heading: str
    banner_text: str
    banner_cta_label: str
    banner_cta_link: str
    has_banner_image: bool
    category_heading: str
    category_subheading: str
    updated_at: datetime


class HomepageSettingsUpdate(BaseModel):
    hero_badge_text: str | None = None
    hero_headline: str | None = None
    hero_subheadline: str | None = None
    destinations_heading: str | None = None
    destinations_subheading: str | None = None
    tours_heading: str | None = None
    tours_subheading: str | None = None
    stays_heading: str | None = None
    stays_subheading: str | None = None
    banner_heading: str | None = None
    banner_text: str | None = None
    banner_cta_label: str | None = None
    banner_cta_link: str | None = None
    category_heading: str | None = None
    category_subheading: str | None = None


class FeaturedListingRead(BaseModel):
    entity_id: uuid.UUID
    title: str


class SetFeaturedListingsRequest(BaseModel):
    entity_ids: list[uuid.UUID] = Field(max_length=12)


class CategoryTileRead(BaseModel):
    id: uuid.UUID
    title: str
    subtitle: str | None
    link: str
    has_image: bool
    gradient_from: str
    gradient_to: str
    sort_order: int
    is_active: bool
    updated_at: datetime


class CategoryTileCreate(BaseModel):
    title: str = Field(max_length=100)
    subtitle: str | None = Field(default=None, max_length=255)
    link: str = Field(max_length=500)
    gradient_from: str | None = None
    gradient_to: str | None = None


class CategoryTileUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=100)
    subtitle: str | None = Field(default=None, max_length=255)
    link: str | None = Field(default=None, max_length=500)
    gradient_from: str | None = None
    gradient_to: str | None = None
    is_active: bool | None = None


class ReorderTilesRequest(BaseModel):
    tile_ids: list[uuid.UUID]


class HomepageRead(BaseModel):
    """Public, fully-resolved homepage content — the single call the homepage
    itself makes."""

    settings: HomepageSettingsRead
    featured_tours: list[FeaturedListingRead]
    featured_properties: list[FeaturedListingRead]
    category_tiles: list[CategoryTileRead]
