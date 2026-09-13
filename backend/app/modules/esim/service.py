"""eSIM order lifecycle — see models.py's module docstring for the state machine and
the design rationale for keeping this entirely separate from `bookings`/`payments`.

Payment confirmation mirrors `payments/service.py` exactly (two independent paths —
SSLCommerz's server-to-server IPN and the traveler's own browser redirect — both
converging on one idempotent confirmation function), because that pattern is already
proven in production; this module doesn't invent a second way to confirm a payment.

Keeping orders moving without a scheduler: Ovigo has no Celery/Redis/cron, and this
module doesn't add one. A `paid`/`provisioning` order is nudged forward by whichever
of these happens first — the Triptel webhook (primary path), or the traveler's own
order-detail page polling (`get_own_order_or_404` calls `sync_order` when the order
hasn't synced in the last 20 seconds) — with an admin "Sync"/"Retry provisioning"
button as the manual fallback. Same fail-open shape as `core/fx.py`/`core/translate.py`/
`core/search_engine.py`: something not arriving promptly degrades to "try again a
little later," never a stuck order with no way forward.
"""
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core import audit, sslcommerz
from app.core.cache import cached
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.esim import pricing
from app.modules.esim import triptel_client
from app.modules.esim.models import EsimOrder, EsimOrderStatus, EsimPricingConfig
from app.modules.esim.schemas import (
    AdminEsimOrderRead,
    EsimOrderCreate,
    EsimOrderRead,
    EsimPricingConfigUpdate,
    EsimProductRead,
)
from app.modules.esim.triptel_client import TriptelError
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.users.models import User

STALE_ORDER_HOURS = 2
SYNC_STALENESS_SECONDS = 20
PRODUCTS_CACHE_TTL_SECONDS = 15 * 60

# --- Status transitions — see models.py's module docstring for the diagram. ---

_ALLOWED_TRANSITIONS: dict[EsimOrderStatus, set[EsimOrderStatus]] = {
    EsimOrderStatus.PENDING_PAYMENT: {EsimOrderStatus.PAID, EsimOrderStatus.CANCELLED},
    EsimOrderStatus.PAID: {EsimOrderStatus.PROVISIONING, EsimOrderStatus.COMPLETED, EsimOrderStatus.REFUND_PENDING},
    EsimOrderStatus.PROVISIONING: {EsimOrderStatus.COMPLETED, EsimOrderStatus.REFUND_PENDING},
    EsimOrderStatus.REFUND_PENDING: {EsimOrderStatus.REFUNDED},
}


def is_transition_allowed(current: EsimOrderStatus, new: EsimOrderStatus) -> bool:
    """Pure — no DB, no side effects. A repeat of the current status is always
    allowed (webhooks and polling race harmlessly); anything else must be a real
    edge in the diagram above."""
    if current == new:
        return True
    return new in _ALLOWED_TRANSITIONS.get(current, set())


def apply_transition(order: EsimOrder, new_status: EsimOrderStatus) -> bool:
    """Mutates `order.status` if this is a genuine transition. Returns False (a
    silent no-op, not an error) when the order is already in `new_status`."""
    if not is_transition_allowed(order.status, new_status):
        raise ConflictError(f"Cannot move an eSIM order from {order.status.value} to {new_status.value}")
    if order.status == new_status:
        return False
    order.status = new_status
    return True


def decide_triptel_update(payload: dict) -> tuple[EsimOrderStatus | None, dict]:
    """Pure: given a Triptel order payload (TRIPTEL_PARTNER_API.md §2.6 shape),
    returns `(new_status, fields)` — `new_status` is `None` when nothing about our
    own status should change yet (still `PROCESSING`). Deliberately excludes
    timestamps (`completed_at`, `last_synced_at`) so this stays deterministic and
    testable without a clock; the caller stamps those."""
    triptel_status = payload.get("status")
    if triptel_status == "COMPLETED":
        return EsimOrderStatus.COMPLETED, {
            "iccid": payload.get("iccid"),
            "lpa_string": payload.get("lpa_string"),
            "qr_code_data": payload.get("qr_code_data"),
            "smdp_address": payload.get("smdp_address"),
            "matching_id": payload.get("matching_id"),
            "install_links": payload.get("install_links"),
            "triptel_status": triptel_status,
        }
    if triptel_status == "FAILED":
        return EsimOrderStatus.REFUND_PENDING, {
            "failure_reason": "The eSIM provider could not issue this eSIM",
            "triptel_status": triptel_status,
        }
    return None, {"triptel_status": triptel_status}


# --- Pricing config (single row) ---


async def _get_pricing_config(db: AsyncSession) -> EsimPricingConfig:
    result = await db.execute(select(EsimPricingConfig).limit(1))
    config = result.scalar_one_or_none()
    if config is None:
        config = EsimPricingConfig()
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


async def _require_store_enabled(db: AsyncSession) -> EsimPricingConfig:
    if not get_settings().triptel_configured:
        raise TriptelError("eSIM service is not available", status_code=503)
    config = await _get_pricing_config(db)
    if not config.is_enabled:
        raise TriptelError("eSIM service is not available", status_code=503)
    return config


# --- Catalog (public, no login) ---


@cached("esim:countries", ttl_seconds=60 * 60)
async def list_countries() -> list[dict]:
    return await triptel_client.list_countries()


_products_cache: dict[str, tuple[float, list[dict]]] = {}


async def _list_products_cached(iso2: str) -> list[dict]:
    """Cached per-ISO2 for 15 minutes via a small local TTL dict — core/cache.py's
    `cached` decorator only supports a single static key, unsuitable for a
    parameterized lookup like this one."""
    iso2 = iso2.upper()
    now = time.monotonic()
    entry = _products_cache.get(iso2)
    if entry and entry[0] > now:
        return entry[1]
    products = await triptel_client.list_products(iso2)
    _products_cache[iso2] = (now + PRODUCTS_CACHE_TTL_SECONDS, products)
    return products


def _price_product(product: dict, config: EsimPricingConfig) -> EsimProductRead:
    cost_usd = Decimal(str(product["retail_price"]))
    return EsimProductRead(
        id=product["id"],
        title=product["title_en"],
        data_label=pricing.data_label(product["is_unlimited"], product["data_amount_gb"]),
        is_unlimited=product["is_unlimited"],
        data_amount_gb=Decimal(str(product["data_amount_gb"])),
        validity_days=product["validity_days"],
        price_bdt=pricing.compute_price_bdt(cost_usd, config.usd_to_bdt_rate, config.markup_pct, config.rounding_step_bdt),
    )


async def list_priced_products(db: AsyncSession, iso2: str) -> list[EsimProductRead]:
    config = await _require_store_enabled(db)
    products = await _list_products_cached(iso2)
    return [_price_product(p, config) for p in products if p.get("is_active", True)]


async def _country_name(iso2: str) -> str:
    countries = await list_countries()
    match = next((c for c in countries if c["iso2"].upper() == iso2.upper()), None)
    return match["name_en"] if match else iso2.upper()


# --- Orders ---


async def create_order(db: AsyncSession, user: User, payload: EsimOrderCreate) -> EsimOrder:
    config = await _require_store_enabled(db)
    iso2 = payload.country_iso2.upper()

    # Live re-fetch, bypassing the products cache, so the traveler is quoted (and
    # later charged) the freshest price Triptel has right now — see
    # TRIPTEL_PARTNER_API.md §2.2 on why prices can't be trusted from a stale cache.
    live_products = await triptel_client.list_products(iso2)
    product = next((p for p in live_products if p["id"] == payload.product_id and p.get("is_active", True)), None)
    if product is None:
        raise NotFoundError("This plan is no longer available")

    cost_usd = Decimal(str(product["retail_price"]))

    account = await triptel_client.get_account()
    wallet_balance = Decimal(str(account["wallet_balance"]))
    if wallet_balance < cost_usd:
        # A traveler must never be able to pay for an eSIM Ovigo can't afford to buy.
        raise TriptelError("eSIM purchases are temporarily unavailable", status_code=503)

    order = EsimOrder(
        user_id=user.id,
        triptel_product_id=product["id"],
        product_title=product["title_en"],
        country_iso2=iso2,
        country_name=await _country_name(iso2),
        data_amount_gb=Decimal(str(product["data_amount_gb"])),
        is_unlimited=product["is_unlimited"],
        validity_days=product["validity_days"],
        cost_usd=cost_usd,
        exchange_rate=config.usd_to_bdt_rate,
        markup_pct=config.markup_pct,
        price_bdt=_price_product(product, config).price_bdt,
        currency="BDT",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


async def get_own_order_or_404(db: AsyncSession, user: User, order_id: uuid.UUID) -> EsimOrder:
    result = await db.execute(select(EsimOrder).where(EsimOrder.id == order_id, EsimOrder.user_id == user.id))
    order = result.scalar_one_or_none()
    if order is None:
        raise NotFoundError("eSIM order not found")
    if order.status in (EsimOrderStatus.PAID, EsimOrderStatus.PROVISIONING):
        stale = (
            order.last_synced_at is None
            or (datetime.now(timezone.utc) - order.last_synced_at).total_seconds() > SYNC_STALENESS_SECONDS
        )
        if stale:
            await sync_order(db, order)
    return order


async def list_own_orders(db: AsyncSession, user: User) -> list[EsimOrder]:
    result = await db.execute(select(EsimOrder).where(EsimOrder.user_id == user.id).order_by(EsimOrder.created_at.desc()))
    return list(result.scalars().all())


async def cancel_order(db: AsyncSession, user: User, order_id: uuid.UUID) -> EsimOrder:
    order = await get_own_order_or_404(db, user, order_id)
    if order.status != EsimOrderStatus.PENDING_PAYMENT:
        raise ConflictError(f"Cannot cancel a {order.status.value} order")
    apply_transition(order, EsimOrderStatus.CANCELLED)
    await db.commit()
    await db.refresh(order)
    return order


# --- Payment ---


async def pay(db: AsyncSession, user: User, order_id: uuid.UUID) -> str:
    order = await get_own_order_or_404(db, user, order_id)
    if order.status != EsimOrderStatus.PENDING_PAYMENT:
        raise ConflictError(f"Order is {order.status.value} — cannot pay")
    if datetime.now(timezone.utc) - order.created_at > timedelta(hours=STALE_ORDER_HOURS):
        raise ConflictError("This order has expired — start again to get current prices")

    tran_id = f"OVIGOESIM{order.id.hex[:12].upper()}{uuid.uuid4().hex[:6].upper()}"
    order.tran_id = tran_id
    await db.commit()

    settings = get_settings()
    result = await sslcommerz.initiate_session(
        tran_id=tran_id,
        amount=str(order.price_bdt),
        success_url=f"{settings.backend_url}/api/v1/esim/payments/callback/success?tran_id={tran_id}",
        fail_url=f"{settings.backend_url}/api/v1/esim/payments/callback/fail?tran_id={tran_id}",
        cancel_url=f"{settings.backend_url}/api/v1/esim/payments/callback/cancel?tran_id={tran_id}",
        ipn_url=f"{settings.backend_url}/api/v1/esim/payments/ipn",
        customer_name=user.full_name,
        customer_email=user.email or "no-email@ovigo.local",
        customer_phone=user.phone or "N/A",
        product_name="Ovigo eSIM",
        product_category="Telecom",
    )
    order.gateway_response = result
    await db.commit()
    return result["GatewayPageURL"]


async def _get_order_by_tran_id_for_update(db: AsyncSession, tran_id: str) -> EsimOrder | None:
    result = await db.execute(select(EsimOrder).where(EsimOrder.tran_id == tran_id).with_for_update())
    return result.scalar_one_or_none()


async def _confirm_esim_payment(db: AsyncSession, order: EsimOrder, val_id: str, validation_result: dict) -> None:
    """Idempotent — does nothing if this order was already confirmed by whichever of
    IPN/redirect got there first."""
    if order.status != EsimOrderStatus.PENDING_PAYMENT:
        return

    reported_amount = Decimal(str(validation_result.get("amount", "0")))
    if validation_result.get("status") not in ("VALID", "VALIDATED"):
        raise ConflictError(f"Transaction not valid: {validation_result.get('status')}")
    if reported_amount != order.price_bdt:
        raise ConflictError(f"Amount mismatch: expected {order.price_bdt}, gateway reports {reported_amount}")

    order.val_id = val_id
    order.gateway_response = validation_result
    apply_transition(order, EsimOrderStatus.PAID)
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    # A Triptel failure here must not undo the payment — place_triptel_order handles
    # its own failures internally and leaves the order `paid` for retry.
    await place_triptel_order(db, order)


async def handle_ipn(db: AsyncSession, form: dict) -> None:
    tran_id = form.get("tran_id")
    val_id = form.get("val_id")
    status = form.get("status")
    if not tran_id:
        raise ConflictError("Missing tran_id in IPN payload")

    order = await _get_order_by_tran_id_for_update(db, tran_id)
    if order is None:
        raise NotFoundError("Unknown transaction")
    if order.status != EsimOrderStatus.PENDING_PAYMENT:
        return

    if status not in ("VALID", "VALIDATED") or not val_id:
        apply_transition(order, EsimOrderStatus.CANCELLED)
        await db.commit()
        return

    validation_result = await sslcommerz.validate_transaction(val_id)
    await _confirm_esim_payment(db, order, val_id, validation_result)


async def confirm_via_redirect(db: AsyncSession, tran_id: str, val_id: str) -> EsimOrder:
    order = await _get_order_by_tran_id_for_update(db, tran_id)
    if order is None:
        raise NotFoundError("Unknown transaction")
    if order.status == EsimOrderStatus.PENDING_PAYMENT:
        validation_result = await sslcommerz.validate_transaction(val_id)
        await _confirm_esim_payment(db, order, val_id, validation_result)
    return order


async def handle_fail_or_cancel(db: AsyncSession, tran_id: str) -> None:
    order = await _get_order_by_tran_id_for_update(db, tran_id)
    if order is None:
        return
    if order.status != EsimOrderStatus.PENDING_PAYMENT:
        return  # already confirmed via another path — never cancel a paid order
    apply_transition(order, EsimOrderStatus.CANCELLED)
    await db.commit()


# --- Triptel provisioning ---


async def place_triptel_order(db: AsyncSession, order: EsimOrder) -> None:
    """Safe to call any number of times — only acts on status `paid`."""
    if order.status != EsimOrderStatus.PAID:
        return

    try:
        result = await triptel_client.create_order(order.triptel_product_id, str(order.id))
    except TriptelError as exc:
        if exc.upstream_status in (400, 404):
            apply_transition(order, EsimOrderStatus.REFUND_PENDING)
            order.failure_reason = f"eSIM provider rejected the order: {exc.upstream_detail or exc.message}"
            await notifications_service.notify(
                db,
                user_id=order.user_id,
                type=NotificationType.ESIM_FAILED,
                title="We couldn't issue your eSIM",
                message="Your payment will be refunded — our team has been notified.",
                link=f"/esim/orders/{order.id}",
            )
            await db.commit()
            return
        # Any other failure (network, 5xx, timeout): stay `paid`, record why, and
        # let the webhook/polling/admin retry later rather than guessing.
        order.failure_reason = str(exc.message)
        await db.commit()
        return

    order.triptel_order_id = str(result.get("order_id"))
    order.triptel_order_no = result.get("order_no")
    order.triptel_status = result.get("status")
    apply_transition(order, EsimOrderStatus.PROVISIONING)
    await db.commit()
    # An idempotent replay may already carry a terminal status in this very response.
    await apply_triptel_order(db, order, result)


async def apply_triptel_order(db: AsyncSession, order: EsimOrder, payload: dict) -> None:
    """The single function every source (webhook, polling, the `create_order`
    response, admin sync) uses to fold a Triptel order payload into our own order."""
    reference = payload.get("customer_reference")
    if reference is not None and str(reference) != str(order.id):
        raise ConflictError("Order reference mismatch")
    if order.triptel_order_id and payload.get("order_id") and str(payload["order_id"]) != order.triptel_order_id:
        raise ConflictError("Triptel order id mismatch")

    if payload.get("order_id"):
        order.triptel_order_id = str(payload["order_id"])
    if payload.get("order_no"):
        order.triptel_order_no = payload["order_no"]

    now = datetime.now(timezone.utc)

    if order.status in (
        EsimOrderStatus.COMPLETED,
        EsimOrderStatus.REFUND_PENDING,
        EsimOrderStatus.REFUNDED,
        EsimOrderStatus.CANCELLED,
    ):
        # Terminal, or already awaiting a human's manual refund — record what
        # Triptel says for the audit trail, but never revisit the decision (guards
        # against an out-of-order or duplicate delivery).
        order.triptel_status = payload.get("status", order.triptel_status)
        order.last_synced_at = now
        await db.commit()
        return

    new_status, fields = decide_triptel_update(payload)
    for key, value in fields.items():
        setattr(order, key, value)
    order.last_synced_at = now

    if new_status is not None:
        changed = apply_transition(order, new_status)
        if changed and new_status == EsimOrderStatus.COMPLETED:
            order.completed_at = now
            await notifications_service.notify(
                db,
                user_id=order.user_id,
                type=NotificationType.ESIM_READY,
                title="Your eSIM is ready",
                message=f"Your {order.product_title} eSIM for {order.country_name} is ready to install.",
                link=f"/esim/orders/{order.id}",
            )
        elif changed and new_status == EsimOrderStatus.REFUND_PENDING:
            await notifications_service.notify(
                db,
                user_id=order.user_id,
                type=NotificationType.ESIM_FAILED,
                title="We couldn't issue your eSIM",
                message="Your payment will be refunded — our team has been notified.",
                link=f"/esim/orders/{order.id}",
            )
    await db.commit()


async def sync_order(db: AsyncSession, order: EsimOrder) -> None:
    if order.triptel_order_id:
        try:
            result = await triptel_client.get_order(order.triptel_order_id)
        except TriptelError:
            order.last_synced_at = datetime.now(timezone.utc)
            await db.commit()
            return
        await apply_triptel_order(db, order, result)
        return

    try:
        result = await triptel_client.find_order_by_reference(str(order.id))
    except TriptelError:
        return

    if result is not None:
        await apply_triptel_order(db, order, result)
    elif order.status == EsimOrderStatus.PAID:
        await place_triptel_order(db, order)


# --- Admin ---


def to_admin_order_read(order: EsimOrder) -> AdminEsimOrderRead:
    base = EsimOrderRead.model_validate(order).model_dump()
    return AdminEsimOrderRead(
        **base,
        user_id=order.user_id,
        user_email=order.user.email if order.user else None,
        tran_id=order.tran_id,
        val_id=order.val_id,
        cost_usd=order.cost_usd,
        exchange_rate=order.exchange_rate,
        margin_bdt=order.price_bdt - (order.cost_usd * order.exchange_rate),
        markup_pct=order.markup_pct,
        triptel_order_id=order.triptel_order_id,
        triptel_status=order.triptel_status,
        last_synced_at=order.last_synced_at,
        refunded_by_id=order.refunded_by_id,
        refund_note=order.refund_note,
    )


async def admin_list_orders(
    db: AsyncSession, status_filter: EsimOrderStatus | None, q: str | None
) -> list[AdminEsimOrderRead]:
    query = select(EsimOrder).options(selectinload(EsimOrder.user)).order_by(EsimOrder.created_at.desc())
    if status_filter is not None:
        query = query.where(EsimOrder.status == status_filter)
    if q:
        pattern = f"%{q}%"
        query = query.join(User, User.id == EsimOrder.user_id).where(
            or_(
                EsimOrder.tran_id.ilike(pattern),
                EsimOrder.iccid.ilike(pattern),
                EsimOrder.triptel_order_no.ilike(pattern),
                User.email.ilike(pattern),
            )
        )
    result = await db.execute(query.distinct())
    return [to_admin_order_read(o) for o in result.scalars().all()]


async def admin_get_order_or_404(db: AsyncSession, order_id: uuid.UUID) -> EsimOrder:
    result = await db.execute(
        select(EsimOrder).where(EsimOrder.id == order_id).options(selectinload(EsimOrder.user))
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise NotFoundError("Order not found")
    return order


async def admin_retry_provisioning(db: AsyncSession, order: EsimOrder) -> None:
    if order.status != EsimOrderStatus.PAID:
        raise ConflictError(f"Can only retry provisioning for a 'paid' order (this one is {order.status.value})")
    await place_triptel_order(db, order)


async def admin_mark_refunded(db: AsyncSession, admin: User, order: EsimOrder, note: str) -> None:
    if order.status != EsimOrderStatus.REFUND_PENDING:
        raise ConflictError(f"Order is {order.status.value} — cannot mark refunded")
    apply_transition(order, EsimOrderStatus.REFUNDED)
    order.refunded_at = datetime.now(timezone.utc)
    order.refunded_by_id = admin.id
    order.refund_note = note
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="esim_order.mark_refunded", entity_type="esim_order", entity_id=order.id,
        extra={"note": note},
    )


async def admin_get_pricing(db: AsyncSession) -> EsimPricingConfig:
    return await _get_pricing_config(db)


async def admin_update_pricing(db: AsyncSession, admin: User, payload: EsimPricingConfigUpdate) -> EsimPricingConfig:
    config = await _get_pricing_config(db)
    config.usd_to_bdt_rate = payload.usd_to_bdt_rate
    config.markup_pct = payload.markup_pct
    config.rounding_step_bdt = payload.rounding_step_bdt
    config.is_enabled = payload.is_enabled
    config.updated_by_id = admin.id
    await db.commit()
    await db.refresh(config)
    _products_cache.clear()  # prices are derived from this config — drop the stale cache
    await audit.record(
        db, actor_id=admin.id, action="esim_pricing_config.update", entity_type="esim_pricing_config",
        entity_id=config.id, extra=payload.model_dump(mode="json"),
    )
    return config


async def admin_get_account() -> dict:
    return await triptel_client.get_account()
