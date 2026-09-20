import uuid

from pydantic import BaseModel, ConfigDict

from app.modules.rentcar.schemas import VehicleRead
from app.modules.stays.schemas import PropertyRead
from app.modules.tours.schemas import TourSummary


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


class LocationBreadcrumbItem(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    type: str


class DestinationDetail(DestinationSummary):
    """The single "everything about this destination" page — Local Experts, Tours,
    Stays, Rent-a-Car and nearby destinations all in one response, rather than making
    a traveler bounce between four separate search pages for the same place. Every
    list is subtree-aware (a Division page surfaces listings tagged to any District/
    Upazila/City underneath it), reusing the exact same search functions the
    dedicated /tours, /stays, /rent-a-car pages already call with a location_slug."""

    breadcrumb: list[LocationBreadcrumbItem]  # root-to-self, e.g. Bangladesh > ... > Cox's Bazar
    tours: list[TourSummary]
    stays: list[PropertyRead]
    vehicles: list[VehicleRead]
    experts: list[ExpertSearchResult]
    nearby: list[DestinationSummary]
