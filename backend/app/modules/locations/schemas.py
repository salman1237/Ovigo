import uuid

from pydantic import BaseModel, ConfigDict

from app.modules.locations.models import LocationType


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
