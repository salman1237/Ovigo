import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    booking_item_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class ReviewerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    full_name: str


class ReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_item_id: uuid.UUID
    tour_id: uuid.UUID | None
    property_id: uuid.UUID | None
    rating: int
    comment: str | None
    created_at: datetime
    reviewer: ReviewerSummary
