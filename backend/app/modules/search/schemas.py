import uuid

from pydantic import BaseModel, ConfigDict


class ExpertSearchResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    partner_role_id: uuid.UUID
    full_name: str
    headline: str | None
    bio: str | None
    years_experience: int | None
    languages: list[str] | None
    # Completed tour-departure bookings for this expert (MVP acceptance criterion #5).
    successful_tour_count: int = 0


class DestinationSummary(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    type: str
    published_tour_count: int
    published_property_count: int
    published_vehicle_count: int = 0
    # One representative photo for this destination — a real tour/property image
    # already in R2, not a stock placeholder. Tour cover preferred over property
    # when both exist (see get_destinations); frontend builds the file URL from
    # whichever pair is non-null via tourImageUrl/propertyImageUrl.
    cover_tour_id: uuid.UUID | None = None
    cover_tour_image_id: uuid.UUID | None = None
    cover_property_id: uuid.UUID | None = None
    cover_property_image_id: uuid.UUID | None = None
