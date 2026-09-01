import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.payouts.models import PayoutStatus


class PayoutPreviewRow(BaseModel):
    partner_role_id: uuid.UUID
    partner_name: str
    commission_count: int
    total_amount: Decimal


class PayoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    partner_role_id: uuid.UUID
    total_amount: Decimal
    commission_count: int
    status: PayoutStatus
    created_at: datetime
    paid_at: datetime
