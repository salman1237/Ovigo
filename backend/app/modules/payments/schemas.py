import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.payments.models import PaymentProvider, PaymentStatus


class PaymentInitiateRequest(BaseModel):
    booking_id: uuid.UUID


class PaymentInitiateResponse(BaseModel):
    payment_id: uuid.UUID
    gateway_page_url: str


class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    provider: PaymentProvider
    tran_id: str
    amount: Decimal
    currency: str
    status: PaymentStatus
    created_at: datetime
