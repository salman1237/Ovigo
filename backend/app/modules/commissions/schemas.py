import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.commissions.models import CommissionStatus


class CommissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_item_id: uuid.UUID
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
    commissions: list[CommissionRead]
