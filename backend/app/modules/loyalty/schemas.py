import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.loyalty.models import LoyaltyTransactionReason


class LoyaltyAccountRead(BaseModel):
    points_balance: int
    point_value_bdt: str
    points_per_100_bdt_spent: int


class LoyaltyTransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID | None
    reason: LoyaltyTransactionReason
    points_delta: int
    note: str | None
    created_at: datetime
