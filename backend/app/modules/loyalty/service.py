import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.modules.bookings.models import Booking
from app.modules.loyalty.models import LoyaltyAccount, LoyaltyTransaction, LoyaltyTransactionReason
from app.modules.loyalty.schemas import LoyaltyAccountRead
from app.modules.users.models import User

# 1 point earned per ৳100 spent (floored), 1 point redeemable for ৳1 off a future
# booking — a simple, symmetric ~1% cashback-in-points program. See this module's
# models.py docstring for how earn/redeem/refund interact with booking lifecycle.
POINTS_PER_100_BDT = 1
POINT_VALUE_BDT = Decimal("1")


async def get_or_create_account(db: AsyncSession, user_id: uuid.UUID) -> LoyaltyAccount:
    result = await db.execute(select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id))
    account = result.scalar_one_or_none()
    if account is None:
        account = LoyaltyAccount(user_id=user_id)
        db.add(account)
        await db.flush()
    return account


async def get_account_read(db: AsyncSession, user: User) -> LoyaltyAccountRead:
    account = await get_or_create_account(db, user.id)
    return LoyaltyAccountRead(
        points_balance=account.points_balance,
        point_value_bdt=str(POINT_VALUE_BDT),
        points_per_100_bdt_spent=POINTS_PER_100_BDT,
    )


async def list_transactions(db: AsyncSession, user: User) -> list[LoyaltyTransaction]:
    result = await db.execute(
        select(LoyaltyTransaction)
        .where(LoyaltyTransaction.user_id == user.id)
        .order_by(LoyaltyTransaction.created_at.desc())
    )
    return list(result.scalars().all())


async def preview_redemption(db: AsyncSession, user: User, points: int, max_discount: Decimal) -> Decimal:
    """Validates `points` against the user's current balance and returns the BDT
    discount it's worth, capped at `max_discount` (the running booking total at this
    point in checkout — a redemption can never make a booking's total negative).
    Pure — does not mutate the account; call `apply_redemption` after the booking is
    flushed to actually debit it."""
    if points <= 0:
        return Decimal("0")
    account = await get_or_create_account(db, user.id)
    if points > account.points_balance:
        raise ConflictError(f"You only have {account.points_balance} point(s) available")
    return min(points * POINT_VALUE_BDT, max_discount)


async def apply_redemption(db: AsyncSession, user: User, booking_id: uuid.UUID, points: int) -> None:
    account = await get_or_create_account(db, user.id)
    account.points_balance -= points
    db.add(
        LoyaltyTransaction(
            user_id=user.id,
            booking_id=booking_id,
            reason=LoyaltyTransactionReason.REDEEMED,
            points_delta=-points,
        )
    )


async def refund_redeemed_points(db: AsyncSession, booking: Booking) -> None:
    """Called when a booking with a points redemption is cancelled — credits the
    points back rather than forfeiting them, since (unlike a promo code) these are
    the user's own previously-earned balance."""
    result = await db.execute(
        select(LoyaltyTransaction).where(
            LoyaltyTransaction.booking_id == booking.id, LoyaltyTransaction.reason == LoyaltyTransactionReason.REDEEMED
        )
    )
    redemption = result.scalar_one_or_none()
    if redemption is None:
        return
    points_to_refund = -redemption.points_delta
    account = await get_or_create_account(db, booking.user_id)
    account.points_balance += points_to_refund
    db.add(
        LoyaltyTransaction(
            user_id=booking.user_id,
            booking_id=booking.id,
            reason=LoyaltyTransactionReason.REFUNDED,
            points_delta=points_to_refund,
            note="Booking cancelled",
        )
    )


async def award_points_for_booking(db: AsyncSession, booking: Booking) -> None:
    """Called when a booking reaches COMPLETED — earns points on what was actually
    paid (`total_amount`, already net of every discount), not the pre-discount price."""
    points = int(booking.total_amount // 100) * POINTS_PER_100_BDT
    if points <= 0:
        return
    account = await get_or_create_account(db, booking.user_id)
    account.points_balance += points
    db.add(
        LoyaltyTransaction(
            user_id=booking.user_id, booking_id=booking.id, reason=LoyaltyTransactionReason.EARNED, points_delta=points
        )
    )
