import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.disputes.models import DisputeResolution, DisputeStatus


class DisputeCreate(BaseModel):
    booking_id: uuid.UUID
    reason: str = Field(min_length=10, max_length=2000)


class DisputeResolve(BaseModel):
    resolution: DisputeResolution
    note: str = Field(min_length=1, max_length=2000)


class DisputeRaisedBy(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str | None


class DisputeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    raised_by: DisputeRaisedBy
    reason: str
    status: DisputeStatus
    resolution: DisputeResolution | None
    resolution_note: str | None
    resolved_at: datetime | None
    created_at: datetime
