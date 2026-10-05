import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.business_network.models import BusinessType, OwnershipType, ReferralStatus

# Ownership types that require/allow an owner invite once approved.
INVITE_ELIGIBLE_OWNERSHIP = {OwnershipType.REFERRED}
# UNVERIFIED_RECOMMENDATION may never be linked to a partner or earn network commission.
COMMISSION_INELIGIBLE_OWNERSHIP = {OwnershipType.UNVERIFIED_RECOMMENDATION}


class BusinessReferralCreate(BaseModel):
    business_name: str = Field(min_length=2, max_length=255)
    business_type: BusinessType
    business_type_note: str | None = Field(default=None, max_length=200)
    contact_phone: str | None = None
    contact_email: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    ownership_type: OwnershipType

    @model_validator(mode="after")
    def _other_needs_note(self) -> "BusinessReferralCreate":
        if self.business_type == BusinessType.OTHER and not self.business_type_note:
            raise ValueError("business_type_note is required when business_type is OTHER")
        return self


class BusinessReferralRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_name: str
    business_type: BusinessType
    business_type_note: str | None
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


class NetworkBookingRead(BaseModel):
    """A completed booking that earned a NETWORK commission for the expert."""

    model_config = ConfigDict(from_attributes=True)

    booking_id: uuid.UUID
    partner_name: str
    item_description: str
    booking_date: datetime
    commission_amount: Decimal
    commission_rate: Decimal


class ClaimReferralRead(BaseModel):
    """What a business owner sees when they open their invite link — enough to
    recognize the referral without exposing the referring expert's other data."""

    id: uuid.UUID
    business_name: str
    business_type: BusinessType
    business_type_note: str | None
    description: str | None
    referring_expert_name: str
    already_claimed: bool
