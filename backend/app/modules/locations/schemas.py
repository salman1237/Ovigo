import uuid

from pydantic import BaseModel, ConfigDict

from app.modules.locations.models import LocationType, TaggableEntityType


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    type: LocationType
    parent_id: uuid.UUID | None
    latitude: float | None
    longitude: float | None
    is_publishable: bool


class LocationCreate(BaseModel):
    name: str
    slug: str
    type: LocationType
    parent_id: uuid.UUID | None = None
    latitude: float | None = None
    longitude: float | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    type: LocationType | None = None
    parent_id: uuid.UUID | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_publishable: bool | None = None


class LocationNode(LocationRead):
    """A location with its children nested, for the full hierarchy tree endpoint."""

    children: list["LocationNode"] = []


class LocationTagSet(BaseModel):
    location_ids: list[uuid.UUID]


class LocationTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: TaggableEntityType
    entity_id: uuid.UUID
    location: LocationRead
