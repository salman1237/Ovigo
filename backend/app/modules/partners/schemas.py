import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.partners.models import ApplicationStatus, DocumentStatus, DocumentType
from app.modules.users.models import PartnerRoleStatus, PartnerRoleType


class PartnerRoleApplyRequest(BaseModel):
    role_type: PartnerRoleType
    message: str | None = None


class PartnerRoleApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ApplicationStatus
    message: str | None
    rejection_reason: str | None
    created_at: datetime


class PartnerDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_type: DocumentType
    file_name: str
    content_type: str
    status: DocumentStatus
    rejection_reason: str | None
    created_at: datetime


class PartnerRoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role_type: PartnerRoleType
    status: PartnerRoleStatus
    approved_at: datetime | None
    created_at: datetime
    applications: list[PartnerRoleApplicationRead] = []
    documents: list[PartnerDocumentRead] = []
