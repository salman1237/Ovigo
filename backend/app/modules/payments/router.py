import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.exceptions import NotFoundError
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.bookings.models import Booking
from app.modules.payments import service
from app.modules.payments.models import Payment
from app.modules.payments.schemas import PaymentInitiateRequest, PaymentInitiateResponse, PaymentRead
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])
settings = get_settings()


@router.post("/initiate", response_model=PaymentInitiateResponse)
async def initiate_payment(
    payload: PaymentInitiateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    payment, gateway_url = await service.initiate_payment(db, current_user, payload.booking_id)
    return PaymentInitiateResponse(payment_id=payment.id, gateway_page_url=gateway_url)


@router.get("/{payment_id}", response_model=PaymentRead)
async def get_payment(
    payment_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Payment).join(Booking, Payment.booking_id == Booking.id).where(
            Payment.id == payment_id, Booking.user_id == current_user.id
        )
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise NotFoundError("Payment not found")
    return payment


@router.post("/ipn")
async def sslcommerz_ipn(request: Request, db: AsyncSession = Depends(get_db)):
    """Server-to-server callback from SSLCommerz. No auth — authenticity comes from
    independently re-validating the val_id against their Validation API, never from
    trusting this payload at face value."""
    form = dict(await request.form())
    await service.handle_ipn(db, form)
    return {"received": True}


async def _callback_params(request: Request) -> dict:
    """SSLCommerz redirects the customer's browser to success_url/fail_url/cancel_url
    via an auto-submitting HTML form using POST, not a GET redirect — the full
    transaction payload (val_id, status, amount, ...) rides in the POST body,
    exactly like the IPN payload does. Query params (just `tran_id`, which we
    appended ourselves when building the URL) are merged in as a fallback."""
    params = dict(request.query_params)
    if request.method == "POST":
        form = await request.form()
        for key, value in form.items():
            params.setdefault(key, value)
    return params


@router.api_route("/callback/success", methods=["GET", "POST"])
async def payment_success(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _callback_params(request)
    tran_id = params.get("tran_id")
    val_id = params.get("val_id")

    if not tran_id:
        return RedirectResponse(f"{settings.frontend_url}/bookings?payment=unknown")

    if val_id:
        payment = await service.confirm_via_redirect(db, tran_id, val_id)
        booking_id = payment.booking_id
    else:
        # No val_id on the redirect (shouldn't normally happen) — fall back to
        # whatever IPN has already recorded, if anything.
        result = await db.execute(select(Payment).where(Payment.tran_id == tran_id))
        payment = result.scalar_one_or_none()
        booking_id = payment.booking_id if payment else None

    if booking_id is None:
        return RedirectResponse(f"{settings.frontend_url}/bookings?payment=unknown")
    return RedirectResponse(f"{settings.frontend_url}/bookings/{booking_id}?payment=success")


@router.api_route("/callback/fail", methods=["GET", "POST"])
async def payment_fail(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _callback_params(request)
    tran_id = params.get("tran_id")
    if tran_id:
        await service.handle_fail_or_cancel(db, tran_id, "fail")
    return RedirectResponse(f"{settings.frontend_url}/bookings?payment=failed")


@router.api_route("/callback/cancel", methods=["GET", "POST"])
async def payment_cancel(request: Request, db: AsyncSession = Depends(get_db)):
    params = await _callback_params(request)
    tran_id = params.get("tran_id")
    if tran_id:
        await service.handle_fail_or_cancel(db, tran_id, "cancel")
    return RedirectResponse(f"{settings.frontend_url}/bookings?payment=cancelled")
