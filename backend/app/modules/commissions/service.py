from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bidding.models import TourBid
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType
from app.modules.commissions.models import Commission, CommissionStatus
from app.modules.commissions.schemas import EarningsSummary
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerRole

# Flat global-by-item-type rates — see models.py docstring for why this isn't a
# configurable rules table yet. Custom bids are expert-delivered work just like a
# published tour, so they share its rate.
COMMISSION_RATES: dict[BookingItemType, Decimal] = {
    BookingItemType.TOUR_DEPARTURE: Decimal("0.10"),
    BookingItemType.ROOM_TYPE: Decimal("0.12"),
    BookingItemType.CUSTOM_BID: Decimal("0.10"),
}


async def _partner_role_for_item(db: AsyncSession, item: BookingItem) -> str | None:
    if item.item_type == BookingItemType.TOUR_DEPARTURE and item.tour_departure_id:
        result = await db.execute(
            select(Tour.local_expert_role_id)
            .join(TourDeparture, TourDeparture.tour_id == Tour.id)
            .where(TourDeparture.id == item.tour_departure_id)
        )
        return result.scalar_one_or_none()
    if item.item_type == BookingItemType.ROOM_TYPE and item.room_type_id:
        result = await db.execute(
            select(Property.host_role_id)
            .join(RoomType, RoomType.property_id == Property.id)
            .where(RoomType.id == item.room_type_id)
        )
        return result.scalar_one_or_none()
    if item.item_type == BookingItemType.CUSTOM_BID and item.custom_bid_id:
        result = await db.execute(select(TourBid.local_expert_role_id).where(TourBid.id == item.custom_bid_id))
        return result.scalar_one_or_none()
    return None


async def create_commissions_for_booking(db: AsyncSession, booking: Booking) -> None:
    """Called once, when a booking's payment is validated. Idempotency is the
    caller's responsibility (payments/service.py only calls this on the PENDING_PAYMENT
    -> CONFIRMED transition, which happens exactly once per booking)."""
    for item in booking.items:
        partner_role_id = await _partner_role_for_item(db, item)
        if partner_role_id is None:
            continue  # shouldn't happen for a valid item, but don't block payment confirmation on it
        rate = COMMISSION_RATES[item.item_type]
        commission_amount = (item.subtotal * rate).quantize(Decimal("0.01"))
        db.add(
            Commission(
                booking_item_id=item.id,
                partner_role_id=partner_role_id,
                gross_amount=item.subtotal,
                rate=rate,
                commission_amount=commission_amount,
                partner_net_amount=item.subtotal - commission_amount,
            )
        )


async def mark_payable_for_booking(db: AsyncSession, booking: Booking) -> None:
    """Called when a booking completes (checkout) — the partner has now actually
    delivered the service, so their commission moves from PENDING to PAYABLE."""
    item_ids = [item.id for item in booking.items]
    if not item_ids:
        return
    result = await db.execute(select(Commission).where(Commission.booking_item_id.in_(item_ids)))
    for commission in result.scalars().all():
        commission.status = CommissionStatus.PAYABLE


async def get_earnings_for_role(db: AsyncSession, role: PartnerRole) -> EarningsSummary:
    result = await db.execute(
        select(Commission).where(Commission.partner_role_id == role.id).order_by(Commission.created_at.desc())
    )
    commissions = list(result.scalars().all())
    total_gross = sum((c.gross_amount for c in commissions), Decimal("0"))
    total_commission = sum((c.commission_amount for c in commissions), Decimal("0"))
    total_net_pending = sum(
        (c.partner_net_amount for c in commissions if c.status == CommissionStatus.PENDING), Decimal("0")
    )
    total_net_payable = sum(
        (c.partner_net_amount for c in commissions if c.status == CommissionStatus.PAYABLE), Decimal("0")
    )
    return EarningsSummary(
        total_gross=total_gross,
        total_commission=total_commission,
        total_net_pending=total_net_pending,
        total_net_payable=total_net_payable,
        commissions=commissions,
    )
