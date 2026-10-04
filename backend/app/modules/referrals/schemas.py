import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.referrals.models import AttributionSource, AttributionStatus
from app.modules.users.models import PartnerRoleType

# What the API reports for an attribution: its stored status, except an ACTIVE row
# whose commission window has closed reads as "expired" (see models.py docstring).
EffectiveStatus = Literal["pending", "active", "expired", "rejected", "revoked"]


class ReferralLinkStats(BaseModel):
    visits: int
    signups: int
    pending: int
    active: int
    expired: int
    expiring_soon: int  # active, with a commission window closing within 30 days
    network_earnings_pending: Decimal
    network_earnings_payable: Decimal
    network_earnings_paid: Decimal


class ReferralLinkRead(BaseModel):
    code: str
    url: str
    role_urls: dict[str, str]  # "guide" / "host" / "hotel" / "rent_a_car" -> preset link
    created_at: datetime
    attribution_months: int
    stats: ReferralLinkStats


class NetworkMemberRead(BaseModel):
    id: uuid.UUID
    member_name: str
    role_type: PartnerRoleType
    source: AttributionSource
    status: EffectiveStatus
    role_approved: bool
    commission_starts_at: datetime | None
    commission_expires_at: datetime | None
    custom_commission_rate: Decimal | None
    joined_at: datetime
    completed_bookings: int
    earnings_pending: Decimal
    earnings_payable: Decimal
    earnings_paid: Decimal


class PublicReferralLinkRead(BaseModel):
    """What a prospect sees on /join/{code} — enough to recognize who invited them,
    nothing that would let a stranger contact the expert off-platform."""

    code: str
    expert_role_id: uuid.UUID
    expert_name: str
    headline: str | None
    photo_url: str | None
    primary_destination: str | None
    years_experience: int | None
    allowed_role_types: list[PartnerRoleType]


class AdminAttributionRead(BaseModel):
    id: uuid.UUID
    referring_expert_role_id: uuid.UUID
    referring_expert_name: str
    referred_user_id: uuid.UUID
    referred_partner_role_id: uuid.UUID
    member_name: str
    role_type: PartnerRoleType
    source: AttributionSource
    stored_status: AttributionStatus
    status: EffectiveStatus
    custom_commission_rate: Decimal | None
    commission_starts_at: datetime | None
    commission_expires_at: datetime | None
    terms_accepted_at: datetime | None
    revoked_reason: str | None
    created_at: datetime
    total_network_commission: Decimal


class RevokeAttributionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class ReassignAttributionRequest(BaseModel):
    expert_role_id: uuid.UUID
    reason: str = Field(min_length=3, max_length=1000)


class AttributionTermsUpdate(BaseModel):
    # Upper bound is a sanity limit only — the engine still caps every NETWORK row at
    # Ovigo's own DIRECT commission on the same item (commissions/service.py).
    custom_commission_rate: Decimal | None = Field(default=None, ge=0, le=Decimal("0.5"))
    commission_expires_at: datetime | None = None
    clear_custom_rate: bool = False
