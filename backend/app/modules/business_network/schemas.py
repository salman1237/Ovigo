import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.business_network.models import OwnershipType, ReferralStatus


class BusinessReferralCreate(BaseModel):
    business_name: str = Field(min_length=2, max_length=255)
    business_type: str = Field(min_length=2, max_length=100)
    contact_phone: str | None = None
    contact_email: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    ownership_type: OwnershipType


class BusinessReferralRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_name: str
    business_type: str
    contact_phone: str | None
    contact_email: str | None
    description: str | None
    ownership_type: OwnershipType
    status: ReferralStatus
    rejection_reason: str | None
    created_at: datetime


class AdminBusinessReferralRead(BusinessReferralRead):
    referring_expert_name: str
