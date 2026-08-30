"""Payment initiation and confirmation.

Confirmation happens through two independent paths, both converging on
`_confirm_payment` (idempotent — checks payment.status before doing anything):
1. IPN (`handle_ipn`) — SSLCommerz's server-to-server callback, the documented
   source of truth, but not guaranteed to arrive instantly (or in local dev, at
   all — it needs a publicly reachable URL, so it only really works once deployed).
2. The customer's browser redirect to success_url (`confirm_via_redirect`) — a
   redundant safety net that independently calls the Validation API using the
   tran_id from the query string, so payment confirmation doesn't strictly depend
   on IPN delivery. This is more robust than relying on IPN alone, not less.
"""
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import sslcommerz
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings import service as bookings_service
from app.modules.bookings.models import Booking, BookingStatus, BookingStatusHistory
from app.modules.commissions import service as commissions_service
from app.modules.payments.models import EscrowTransaction, Payment, PaymentStatus
from app.modules.users.models import User


async def initiate_payment(db: AsyncSession, user: User, booking_id: uuid.UUID) -> tuple[Payment, str]:
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == user.id).options(selectinload(Booking.items))
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise NotFoundError("Booking not found")
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise ConflictError(f"Booking is {booking.status.value} — cannot initiate payment")

    tran_id = f"OVIGO{booking.id.hex[:12].upper()}{uuid.uuid4().hex[:6].upper()}"
    payment = Payment(booking_id=booking.id, tran_id=tran_id, amount=booking.total_amount)
    db.add(payment)
    await db.commit()

    from app.config import get_settings

    settings = get_settings()
    result = await sslcommerz.initiate_session(
        tran_id=tran_id,
        amount=str(booking.total_amount),
        success_url=f"{settings.backend_url}/api/v1/payments/callback/success?tran_id={tran_id}",
        fail_url=f"{settings.backend_url}/api/v1/payments/callback/fail?tran_id={tran_id}",
        cancel_url=f"{settings.backend_url}/api/v1/payments/callback/cancel?tran_id={tran_id}",
        ipn_url=f"{settings.backend_url}/api/v1/payments/ipn",
        customer_name=user.full_name,
        customer_email=user.email or "no-email@ovigo.local",
        customer_phone=user.phone or "N/A",
    )
    payment.gateway_response = result
    await db.commit()
    return payment, result["GatewayPageURL"]


async def _get_payment_with_booking(db: AsyncSession, tran_id: str) -> Payment | None:
    result = await db.execute(
        select(Payment)
        .where(Payment.tran_id == tran_id)
        .options(selectinload(Payment.booking).selectinload(Booking.items))
    )
    return result.scalar_one_or_none()


async def _confirm_payment(db: AsyncSession, payment: Payment, val_id: str, validation_result: dict) -> None:
    """Idempotent: does nothing if this payment was already confirmed (by whichever
    of IPN/redirect got there first)."""
    if payment.status == PaymentStatus.VALIDATED:
        return

    reported_amount = Decimal(str(validation_result.get("amount", "0")))
    if validation_result.get("status") not in ("VALID", "VALIDATED"):
        raise ConflictError(f"Transaction not valid: {validation_result.get('status')}")
    if reported_amount != payment.amount:
        raise ConflictError(f"Amount mismatch: expected {payment.amount}, gateway reports {reported_amount}")

    payment.status = PaymentStatus.VALIDATED
    payment.val_id = val_id
    payment.gateway_response = validation_result

    booking = payment.booking
    db.add(
        BookingStatusHistory(
            booking_id=booking.id,
            from_status=booking.status.value,
            to_status=BookingStatus.CONFIRMED.value,
        )
    )
    booking.status = BookingStatus.CONFIRMED
    db.add(EscrowTransaction(booking_id=booking.id, amount=booking.total_amount))
    await commissions_service.create_commissions_for_booking(db, booking)
    await db.commit()


async def handle_ipn(db: AsyncSession, form: dict) -> None:
    tran_id = form.get("tran_id")
    val_id = form.get("val_id")
    status = form.get("status")
    if not tran_id:
        raise ConflictError("Missing tran_id in IPN payload")

    payment = await _get_payment_with_booking(db, tran_id)
    if payment is None:
        raise NotFoundError("Unknown transaction")

    if status not in ("VALID", "VALIDATED") or not val_id:
        await bookings_service.cancel_booking_by_id(db, payment.booking_id, note=f"Payment {status or 'failed'} (IPN)")
        payment.status = PaymentStatus.FAILED
        await db.commit()
        return

    validation_result = await sslcommerz.validate_transaction(val_id)
    await _confirm_payment(db, payment, val_id, validation_result)


async def confirm_via_redirect(db: AsyncSession, tran_id: str, val_id: str) -> Payment:
    """Called from the success_url GET handler — independent confirmation path,
    see module docstring. SSLCommerz includes val_id in the redirect query string,
    so this doesn't have to wait for IPN."""
    payment = await _get_payment_with_booking(db, tran_id)
    if payment is None:
        raise NotFoundError("Unknown transaction")
    if payment.status != PaymentStatus.VALIDATED:
        validation_result = await sslcommerz.validate_transaction(val_id)
        await _confirm_payment(db, payment, val_id, validation_result)
    return payment


async def handle_fail_or_cancel(db: AsyncSession, tran_id: str, reason: str) -> None:
    payment = await _get_payment_with_booking(db, tran_id)
    if payment is None:
        return
    if payment.status == PaymentStatus.VALIDATED:
        return  # already confirmed via another path — don't cancel a paid booking
    payment.status = PaymentStatus.FAILED if reason == "fail" else PaymentStatus.CANCELLED
    await bookings_service.cancel_booking_by_id(db, payment.booking_id, note=f"Payment {reason}")
    await db.commit()
