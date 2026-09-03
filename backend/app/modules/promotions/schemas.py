import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.promotions.models import PromoDiscountType


class PromoCodeCreate(BaseModel):
    code: str = Field(min_length=3, max_length=50)
    discount_type: PromoDiscountType
    discount_value: Decimal
    max_redemptions: int | None = None
    max_redemptions_per_user: int = 1
    expires_at: datetime | None = None


class PromoCodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    discount_type: PromoDiscountType
    discount_value: Decimal
    max_redemptions: int | None
    redemption_count: int
    max_redemptions_per_user: int
    expires_at: datetime | None
    is_active: bool
    created_at: datetime


class PromoCodeValidateResult(BaseModel):
    is_valid: bool
    reason: str | None = None
    discount_type: PromoDiscountType | None = None
    discount_value: Decimal | None = None
