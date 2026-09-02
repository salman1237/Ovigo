import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.modules.notifications.models import CampaignAudience, NotificationType
from app.modules.users.models import PartnerRoleType


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    title: str
    message: str
    link: str | None
    is_read: bool
    created_at: datetime


class UnreadCount(BaseModel):
    count: int


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str


class TemplateUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    body: str | None = None


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    subject: str
    body: str
    created_at: datetime
    updated_at: datetime


class CampaignCreate(BaseModel):
    template_id: uuid.UUID | None = None
    title: str | None = None
    message: str | None = None
    audience: CampaignAudience
    audience_role_type: PartnerRoleType | None = None
    is_urgent: bool = False

    @model_validator(mode="after")
    def _check(self) -> "CampaignCreate":
        if self.template_id is None and (not self.title or not self.message):
            raise ValueError("Provide a template_id, or both a title and a message")
        if self.audience_role_type is not None and self.audience != CampaignAudience.PARTNERS_ONLY:
            raise ValueError("audience_role_type only applies when audience is partners_only")
        return self


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    template_id: uuid.UUID | None
    title: str
    message: str
    audience: CampaignAudience
    audience_role_type: str | None
    is_urgent: bool
    recipient_count: int
    sent_by_id: uuid.UUID | None
    created_at: datetime
