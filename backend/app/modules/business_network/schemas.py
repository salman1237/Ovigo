import uuid
from datetime import datetime
from decimal import Decimal

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
    linked_partner_role_id: uuid.UUID | None
    invite_token: str | None
    invite_sent_at: datetime | None
    invited_user_id: uuid.UUID | None
    invite_accepted_at: datetime | None
    is_business_verified: bool
    verified_at: datetime | None
    custom_commission_rate: Decimal | None
    created_at: datetime


class AdminBusinessReferralRead(BusinessReferralRead):
    referring_expert_name: str


class LinkPartnerRequest(BaseModel):
    partner_role_id: uuid.UUID


class VerifyBusinessRequest(BaseModel):
    verified: bool


class SetCommissionRateRequest(BaseModel):
    rate: Decimal | None = Field(default=None, ge=0, le=1)


class ClaimReferralRead(BaseModel):
    """What a business owner sees when they open their invite link — enough to
    recognize the referral without exposing the referring expert's other data."""

    id: uuid.UUID
    business_name: str
    business_type: str
    description: str | None
    referring_expert_name: str
    already_claimed: bool
