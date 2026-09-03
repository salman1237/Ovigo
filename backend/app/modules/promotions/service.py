import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.promotions.models import PromoCode, PromoDiscountType, PromoRedemption
from app.modules.promotions.schemas import PromoCodeCreate, PromoCodeValidateResult
from app.modules.users.models import User


async def create_promo_code(db: AsyncSession, admin: User, payload: PromoCodeCreate) -> PromoCode:
    code = payload.code.upper()
    existing = await db.execute(select(PromoCode.id).where(PromoCode.code == code))
    if existing.scalar_one_or_none() is not None:
        raise ConflictError(f"Promo code '{code}' already exists")
    promo = PromoCode(**{**payload.model_dump(), "code": code}, created_by_admin_id=admin.id)
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    return promo


async def list_promo_codes(db: AsyncSession) -> list[PromoCode]:
    result = await db.execute(select(PromoCode).order_by(PromoCode.created_at.desc()))
    return list(result.scalars().all())


async def deactivate_promo_code(db: AsyncSession, promo_code_id: uuid.UUID) -> PromoCode:
    result = await db.execute(select(PromoCode).where(PromoCode.id == promo_code_id))
    promo = result.scalar_one_or_none()
    if promo is None:
        raise NotFoundError("Promo code not found")
    promo.is_active = False
    await db.commit()
    await db.refresh(promo)
    return promo


async def _get_code_or_none(db: AsyncSession, code: str) -> PromoCode | None:
    result = await db.execute(select(PromoCode).where(PromoCode.code == code.upper()))
    return result.scalar_one_or_none()


def _validation_error(promo: PromoCode | None) -> str | None:
    if promo is None:
        return "Promo code not found"
    if not promo.is_active:
        return "This promo code is no longer active"
    if promo.expires_at is not None and promo.expires_at < datetime.now(timezone.utc):
        return "This promo code has expired"
    if promo.max_redemptions is not None and promo.redemption_count >= promo.max_redemptions:
        return "This promo code has reached its redemption limit"
    return None


async def validate_promo_code(db: AsyncSession, code: str) -> PromoCodeValidateResult:
    """A lightweight, pre-checkout preview — doesn't check the per-user redemption
    count (that needs a logged-in user, see `preview_redemption` for the real gate
    applied at booking time) or compute an actual discount amount (that needs the
    booking's total, unknown here)."""
    promo = await _get_code_or_none(db, code)
    error = _validation_error(promo)
    if error:
        return PromoCodeValidateResult(is_valid=False, reason=error)
    return PromoCodeValidateResult(is_valid=True, discount_type=promo.discount_type, discount_value=promo.discount_value)


async def preview_redemption(
    db: AsyncSession, user: User, code: str, current_total: Decimal
) -> tuple[Decimal, PromoCode]:
    """Validates `code` for this specific user (including their own past-redemption
    count) and returns the BDT discount it's worth against `current_total` (the
    running booking total after the bundle discount, before this promo). Pure — does
    not mutate anything; call `apply_redemption` after the booking is flushed."""
    promo = await _get_code_or_none(db, code)
    error = _validation_error(promo)
    if error:
        raise ConflictError(error)

    user_redemptions = await db.execute(
        select(func.count(PromoRedemption.id)).where(
            PromoRedemption.promo_code_id == promo.id, PromoRedemption.user_id == user.id
        )
    )
    if user_redemptions.scalar_one() >= promo.max_redemptions_per_user:
        raise ConflictError("You've already used this promo code")

    if promo.discount_type == PromoDiscountType.PERCENTAGE:
        discount = (current_total * promo.discount_value / Decimal("100")).quantize(Decimal("0.01"))
    else:
        discount = promo.discount_value
    return min(discount, current_total), promo


async def apply_redemption(
    db: AsyncSession, user: User, booking_id: uuid.UUID, promo: PromoCode, discount_amount: Decimal
) -> None:
    promo.redemption_count += 1
    db.add(PromoRedemption(promo_code_id=promo.id, user_id=user.id, booking_id=booking_id, discount_amount=discount_amount))
