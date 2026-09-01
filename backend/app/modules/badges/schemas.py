import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.badges.models import BadgeStatus, BadgeType
from app.modules.locations.models import TaggableEntityType


class BadgeApply(BaseModel):
    entity_type: TaggableEntityType
    entity_id: uuid.UUID
    badge_type: BadgeType
    private_note: str | None = Field(default=None, max_length=2000)


class BadgeRead(BaseModel):
    """Public shape — deliberately excludes private_note and rejection_reason."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: TaggableEntityType
    entity_id: uuid.UUID
    badge_type: BadgeType
    status: BadgeStatus
    is_auto_awarded: bool
    awarded_at: datetime | None
    created_at: datetime


class AdminBadgeRead(BadgeRead):
    private_note: str | None
    rejection_reason: str | None
    applied_by_user_id: uuid.UUID | None
