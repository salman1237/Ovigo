import uuid
from datetime import datetime
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
    commissions: list[CommissionRead]


class CommissionRuleCreate(BaseModel):
    scope: CommissionRuleScope
    item_type: BookingItemType | None = None
    partner_role_id: uuid.UUID | None = None
    rate: Decimal = Field(gt=0, lt=1)


class CommissionRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scope: CommissionRuleScope
    item_type: BookingItemType | None
    partner_role_id: uuid.UUID | None
    rate: Decimal
    is_active: bool
    created_at: datetime
