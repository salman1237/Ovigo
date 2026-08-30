import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.partners.schemas import PartnerDocumentRead
from app.modules.stays.models import PropertyStatus
from app.modules.tours.models import TourStatus
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


class AdminTourRead(BaseModel):
    """A tour as seen in the moderation queue — includes the submitting expert's identity."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    slug: str
    description: str | None
    duration_days: int
    status: TourStatus
    rejection_reason: str | None
    created_at: datetime
    applicant: AdminUserSummary


class AdminPropertyRead(BaseModel):
    """A property as seen in the moderation queue — includes the submitting host's identity."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    status: PropertyStatus
    rejection_reason: str | None
    created_at: datetime
    applicant: AdminUserSummary


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    extra: dict | None
    created_at: datetime
