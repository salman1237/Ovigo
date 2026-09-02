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

from app.core import audit, sslcommerz
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings import service as bookings_service
from app.modules.bookings.models import Booking, BookingStatus, BookingStatusHistory
from app.modules.commissions import service as commissions_service
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.payments.models import EscrowTransaction, Payment, PaymentProvider, PaymentStatus
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


async def _activate_booking(db: AsyncSession, payment: Payment) -> None:
    """Shared by every confirmation path (SSLCommerz IPN/redirect, admin-verified
    bank transfer) — marks the payment validated, confirms the booking, opens
    escrow, and creates commissions. Idempotent: a caller must check
    payment.status before calling this, same as the callers below do."""
    payment.status = PaymentStatus.VALIDATED

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
    await notifications_service.notify(
        db,
        user_id=booking.user_id,
        type=NotificationType.BOOKING_CONFIRMED,
        title="Booking confirmed",
        message="Your payment was successful and your booking is now confirmed.",
        link=f"/bookings/{booking.id}",
    )
    await db.commit()


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

    payment.val_id = val_id
    payment.gateway_response = validation_result
    await _activate_booking(db, payment)


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
        await notifications_service.notify(
            db,
            user_id=payment.booking.user_id,
            type=NotificationType.PAYMENT_FAILED,
            title="Payment unsuccessful",
            message="Your payment could not be confirmed and the booking hold has been released.",
            link=f"/bookings/{payment.booking_id}",
        )
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
    await notifications_service.notify(
        db,
        user_id=payment.booking.user_id,
        type=NotificationType.PAYMENT_FAILED,
        title="Payment unsuccessful",
        message=f"Your payment was {reason}ed and the booking hold has been released.",
        link=f"/bookings/{payment.booking_id}",
    )
    await bookings_service.cancel_booking_by_id(db, payment.booking_id, note=f"Payment {reason}")
    await db.commit()


async def initiate_bank_transfer(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Payment:
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.user_id == user.id).options(selectinload(Booking.items))
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise NotFoundError("Booking not found")
    if booking.status != BookingStatus.PENDING_PAYMENT:
        raise ConflictError(f"Booking is {booking.status.value} — cannot initiate payment")

    tran_id = f"OVIGO-BT-{booking.id.hex[:12].upper()}{uuid.uuid4().hex[:6].upper()}"
    payment = Payment(booking_id=booking.id, provider=PaymentProvider.BANK_TRANSFER, tran_id=tran_id, amount=booking.total_amount)
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


async def submit_bank_reference(db: AsyncSession, user: User, payment_id: uuid.UUID, reference: str) -> Payment:
    result = await db.execute(
        select(Payment)
        .join(Booking, Booking.id == Payment.booking_id)
        .where(Payment.id == payment_id, Booking.user_id == user.id)
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise NotFoundError("Payment not found")
    if payment.provider != PaymentProvider.BANK_TRANSFER:
        raise ConflictError("Not a bank transfer payment")
    if payment.status != PaymentStatus.INITIATED:
        raise ConflictError(f"Payment is already {payment.status.value}")

    payment.bank_reference = reference
    await db.commit()
    await db.refresh(payment)
    return payment


async def list_pending_bank_transfers(db: AsyncSession) -> list[Payment]:
    result = await db.execute(
        select(Payment)
        .where(Payment.provider == PaymentProvider.BANK_TRANSFER, Payment.status == PaymentStatus.INITIATED)
        .order_by(Payment.created_at.desc())
    )
    return list(result.scalars().all())


async def _get_bank_transfer_or_404(db: AsyncSession, payment_id: uuid.UUID) -> Payment:
    result = await db.execute(
        select(Payment).where(Payment.id == payment_id).options(selectinload(Payment.booking).selectinload(Booking.items))
    )
    payment = result.scalar_one_or_none()
    if payment is None:
        raise NotFoundError("Payment not found")
    if payment.provider != PaymentProvider.BANK_TRANSFER:
        raise ConflictError("Not a bank transfer payment")
    return payment


async def verify_bank_transfer(db: AsyncSession, admin: User, payment_id: uuid.UUID) -> Payment:
    payment = await _get_bank_transfer_or_404(db, payment_id)
    if payment.status != PaymentStatus.INITIATED:
        raise ConflictError(f"Payment is already {payment.status.value}")

    await _activate_booking(db, payment)
    await audit.record(db, actor_id=admin.id, action="payment.verify_bank_transfer", entity_type="payment", entity_id=payment.id)
    return payment


async def reject_bank_transfer(db: AsyncSession, admin: User, payment_id: uuid.UUID, reason: str) -> Payment:
    payment = await _get_bank_transfer_or_404(db, payment_id)
    if payment.status == PaymentStatus.VALIDATED:
        raise ConflictError("Payment was already verified — cannot reject")
    if payment.status != PaymentStatus.INITIATED:
        raise ConflictError(f"Payment is already {payment.status.value}")

    payment.status = PaymentStatus.FAILED
    await notifications_service.notify(
        db,
        user_id=payment.booking.user_id,
        type=NotificationType.PAYMENT_FAILED,
        title="Payment unsuccessful",
        message=f"Your bank transfer could not be verified: {reason}",
        link=f"/bookings/{payment.booking_id}",
    )
    await bookings_service.cancel_booking_by_id(db, payment.booking_id, note=f"Bank transfer rejected: {reason}")
    await audit.record(
        db, actor_id=admin.id, action="payment.reject_bank_transfer", entity_type="payment", entity_id=payment.id,
        extra={"reason": reason},
    )
    await db.commit()
    return payment
