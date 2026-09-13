import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.esim.models import EsimOrderStatus


# --- Public catalog (never includes Triptel's retail_price/cost_usd) ---


class EsimCountryRead(BaseModel):
    id: int
    iso2: str
    iso3: str
    name_en: str
    name_bn: str | None
    flag_url: str | None
    region: str | None
    is_popular: bool


class EsimProductRead(BaseModel):
    id: str
    title: str
    data_label: str
    is_unlimited: bool
    data_amount_gb: Decimal
    validity_days: int
    price_bdt: Decimal


# --- Orders (traveler-facing) ---


class EsimOrderCreate(BaseModel):
    product_id: str
    country_iso2: str = Field(min_length=2, max_length=2)


class InstallLinks(BaseModel):
    ios: str | None = None
    android: str | None = None


class EsimOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: EsimOrderStatus
    triptel_product_id: str  # so a "Start again" flow can re-order the same plan at current prices
    product_title: str
    country_iso2: str
    country_name: str
    data_amount_gb: Decimal
    is_unlimited: bool
    validity_days: int
    price_bdt: Decimal
    currency: str
    triptel_order_no: str | None
    iccid: str | None
    lpa_string: str | None
    qr_code_data: str | None
    smdp_address: str | None
    matching_id: str | None
    install_links: InstallLinks | None
    failure_reason: str | None
    refunded_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EsimPaymentInitiateResponse(BaseModel):
    gateway_page_url: str


# --- Admin ---


class AdminEsimOrderRead(EsimOrderRead):
    user_id: uuid.UUID
    user_email: str | None
    tran_id: str | None
    val_id: str | None
    cost_usd: Decimal
    exchange_rate: Decimal
    margin_bdt: Decimal  # price_bdt - (cost_usd * exchange_rate) at order time — computed in service.py, not stored
    markup_pct: Decimal
    triptel_order_id: str | None
    triptel_status: str | None
    last_synced_at: datetime | None
    refunded_by_id: uuid.UUID | None
    refund_note: str | None


class EsimMarkRefundedRequest(BaseModel):
    note: str = Field(min_length=3, max_length=1000)


class EsimPricingConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    usd_to_bdt_rate: Decimal
    markup_pct: Decimal
    rounding_step_bdt: int
    is_enabled: bool
    updated_at: datetime


class EsimPricingConfigUpdate(BaseModel):
    usd_to_bdt_rate: Decimal = Field(gt=0)
    markup_pct: Decimal = Field(ge=0, le=200)
    rounding_step_bdt: int = Field(ge=0)
    is_enabled: bool = True


class EsimAccountRead(BaseModel):
    business_name: str
    commission_rate_pct: Decimal
    wallet_balance: Decimal
    wallet_currency: str
    commission_balance: Decimal
    webhook_configured: bool
