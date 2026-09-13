import hashlib
import hmac
import json
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.core.permissions import require_admin, require_super_admin
from app.core.rate_limit import limiter
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.esim import service
from app.modules.esim.models import EsimOrder, EsimOrderStatus
from app.modules.esim.schemas import (
    AdminEsimOrderRead,
    EsimAccountRead,
    EsimCountryRead,
    EsimMarkRefundedRequest,
    EsimOrderCreate,
    EsimOrderRead,
    EsimPaymentInitiateResponse,
    EsimPricingConfigRead,
    EsimPricingConfigUpdate,
    EsimProductRead,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/esim", tags=["esim"])
admin_router = APIRouter(prefix="/api/v1/admin/esim", tags=["esim"], dependencies=[Depends(require_admin)])
settings = get_settings()


# --- Public catalog ---


@router.get("/countries", response_model=list[EsimCountryRead])
async def list_countries():
    return await service.list_countries()


@router.get("/countries/{iso2}/products", response_model=list[EsimProductRead])
async def list_products(iso2: str, db: AsyncSession = Depends(get_db)):
    return await service.list_priced_products(db, iso2)


# --- Orders (traveler) ---


@router.post("/orders", response_model=EsimOrderRead, status_code=201)
@limiter.limit("10/minute")
async def create_order(
    request: Request,
    payload: EsimOrderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_order(db, current_user, payload)


@router.get("/orders", response_model=list[EsimOrderRead])
async def list_orders(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_own_orders(db, current_user)


@router.get("/orders/{order_id}", response_model=EsimOrderRead)
async def get_order(
    order_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.get_own_order_or_404(db, current_user, order_id)


@router.post("/orders/{order_id}/pay", response_model=EsimPaymentInitiateResponse)
async def pay_order(
    order_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    gateway_page_url = await service.pay(db, current_user, order_id)
    return EsimPaymentInitiateResponse(gateway_page_url=gateway_page_url)


@router.post("/orders/{order_id}/cancel", response_model=EsimOrderRead)
async def cancel_order(
    order_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.cancel_order(db, current_user, order_id)


# --- SSLCommerz payment callbacks ---


@router.post("/payments/ipn")
async def sslcommerz_ipn(request: Request, db: AsyncSession = Depends(get_db)):
    """Server-to-server callback from SSLCommerz. No auth — authenticity comes from
    independently re-validating val_id against their Validation API."""
    form = dict(await request.form())
    await service.handle_ipn(db, form)
    return {"received": True}


async def _callback_params(request: Request) -> dict:
    params = dict(request.query_params)
    if request.method == "POST":
        form = await request.form()
        for key, value in form.items():
            params.setdefault(key, value)
    return params


@router.api_route("/payments/callback/success", methods=["GET", "POST"])
async def payment_success(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _callback_params(request)
    tran_id = params.get("tran_id")
    val_id = params.get("val_id")

    if not tran_id:
        return RedirectResponse(f"{settings.frontend_url}/esim/orders?payment=unknown")

    if val_id:
        order = await service.confirm_via_redirect(db, tran_id, val_id)
        order_id = order.id
    else:
        result = await db.execute(select(EsimOrder).where(EsimOrder.tran_id == tran_id))
        order = result.scalar_one_or_none()
        order_id = order.id if order else None

    if order_id is None:
        return RedirectResponse(f"{settings.frontend_url}/esim/orders?payment=unknown")
    return RedirectResponse(f"{settings.frontend_url}/esim/orders/{order_id}?payment=success")


@router.api_route("/payments/callback/fail", methods=["GET", "POST"])
async def payment_fail(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _callback_params(request)
    tran_id = params.get("tran_id")
    if tran_id:
        await service.handle_fail_or_cancel(db, tran_id)
    return RedirectResponse(f"{settings.frontend_url}/esim/orders?payment=failed")


@router.api_route("/payments/callback/cancel", methods=["GET", "POST"])
async def payment_cancel(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _callback_params(request)
    tran_id = params.get("tran_id")
    if tran_id:
        await service.handle_fail_or_cancel(db, tran_id)
    return RedirectResponse(f"{settings.frontend_url}/esim/orders?payment=cancelled")


# --- Triptel webhook ---


def verify_webhook_signature(secret: str | None, raw_body: bytes, signature: str | None) -> bool:
    """Pure — hex HMAC-SHA256 of the exact raw request body, keyed with the webhook
    secret (TRIPTEL_PARTNER_API.md §3). Computed over the raw bytes, not a
    re-serialized parse of them — re-serializing (even losslessly re-encoding valid
    JSON) can reorder keys/whitespace and silently break the signature."""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhooks/triptel")
async def triptel_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw = await request.body()
    signature = request.headers.get("X-Webhook-Signature", "")
    if not verify_webhook_signature(settings.triptel_webhook_secret, raw, signature):
        raise UnauthorizedError("Invalid webhook signature")

    payload = json.loads(raw)
    reference = payload.get("customer_reference")
    try:
        order_id = uuid.UUID(str(reference))
    except (ValueError, TypeError):
        return {"received": True}  # malformed reference — ack so Triptel doesn't retry forever

    result = await db.execute(select(EsimOrder).where(EsimOrder.id == order_id))
    order = result.scalar_one_or_none()
    if order is None:
        return {"received": True}  # unknown reference — ack so Triptel doesn't retry forever

    await service.apply_triptel_order(db, order, payload)
    return {"received": True}


# --- Admin ---


@admin_router.get("/orders", response_model=list[AdminEsimOrderRead])
async def admin_list_orders(
    status: EsimOrderStatus | None = None, q: str | None = None, db: AsyncSession = Depends(get_db)
):
    return await service.admin_list_orders(db, status, q)


@admin_router.get("/orders/{order_id}", response_model=AdminEsimOrderRead)
async def admin_get_order(order_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    order = await service.admin_get_order_or_404(db, order_id)
    return service.to_admin_order_read(order)


@admin_router.post("/orders/{order_id}/sync", response_model=AdminEsimOrderRead)
async def admin_sync_order(order_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    order = await service.admin_get_order_or_404(db, order_id)
    await service.sync_order(db, order)
    return service.to_admin_order_read(order)


@admin_router.post("/orders/{order_id}/retry-provisioning", response_model=AdminEsimOrderRead)
async def admin_retry_provisioning(order_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    order = await service.admin_get_order_or_404(db, order_id)
    await service.admin_retry_provisioning(db, order)
    return service.to_admin_order_read(order)


@admin_router.post("/orders/{order_id}/mark-refunded", response_model=AdminEsimOrderRead)
async def admin_mark_refunded(
    order_id: uuid.UUID,
    payload: EsimMarkRefundedRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    order = await service.admin_get_order_or_404(db, order_id)
    await service.admin_mark_refunded(db, admin, order, payload.note)
    return service.to_admin_order_read(order)


@admin_router.get("/pricing", response_model=EsimPricingConfigRead)
async def admin_get_pricing(db: AsyncSession = Depends(get_db)):
    return await service.admin_get_pricing(db)


@admin_router.put("/pricing", response_model=EsimPricingConfigRead)
async def admin_update_pricing(
    payload: EsimPricingConfigUpdate,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_update_pricing(db, admin, payload)


@admin_router.get("/account", response_model=EsimAccountRead)
async def admin_get_account():
    return await service.admin_get_account()
