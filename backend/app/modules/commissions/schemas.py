import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.bookings.models import BookingItemType
from app.modules.commissions.models import CommissionRuleScope, CommissionSource, CommissionStatus


class CommissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_item_id: uuid.UUID
    source: CommissionSource
    gross_amount: Decimal
    rate: Decimal
    commission_amount: Decimal
    partner_net_amount: Decimal
    status: CommissionStatus
    created_at: datetime


class EarningsSummary(BaseModel):
    total_gross: Decimal
    total_commission: Decimal
    total_net_pending: Decimal
    total_net_payable: Decimal
    total_net_paid: Decimal
    total_net_on_hold: Decimal
    commissions: list[CommissionRead]


class CommissionRuleCreate(BaseModel):
    scope: CommissionRuleScope
    item_type: BookingItemType | None = None
    partner_role_id: uuid.UUID | None = None
    rate: Decimal = Field(gt=0, lt=1)
    effective_date: date | None = None
    expiry_date: date | None = None


class CommissionRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scope: CommissionRuleScope
    item_type: BookingItemType | None
    partner_role_id: uuid.UUID | None
    rate: Decimal
    is_active: bool
    effective_date: date | None
    expiry_date: date | None
    created_at: datetime


class CommissionPreviewRequest(BaseModel):
    item_type: BookingItemType
    partner_role_id: uuid.UUID
    gross_amount: Decimal = Field(gt=0)


class CommissionPreviewResponse(BaseModel):
    """A dry run of the resolution logic — no Commission row is created. Shows
    both DIRECT and, if the partner has an approved+linked referral, NETWORK."""

    direct_rate: Decimal
    direct_rule_id: uuid.UUID | None
    direct_commission_amount: Decimal
    direct_partner_net_amount: Decimal
    network_rate: Decimal | None
    network_rule_id: uuid.UUID | None
    network_commission_amount: Decimal | None
    network_referring_role_id: uuid.UUID | None
