import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.partners.schemas import PartnerDocumentRead
from app.modules.users.models import PartnerRoleStatus, PartnerRoleType


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str | None
    phone: str | None


class AdminPartnerRoleRead(BaseModel):
    """A partner role as seen by admins reviewing applications — includes the
    applicant's identity, which the partner-facing schema deliberately omits."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role_type: PartnerRoleType
    status: PartnerRoleStatus
    approved_at: datetime | None
    created_at: datetime
    documents: list[PartnerDocumentRead] = []
    applicant: AdminUserSummary


class RejectRequest(BaseModel):
    reason: str


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    extra: dict | None
    created_at: datetime
