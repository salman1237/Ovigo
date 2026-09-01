"""Commission calculation with a configurable, priority-resolved rules engine.
See models.py for the overall design (DIRECT vs NETWORK commission, rule scopes).
"""
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType
from app.modules.business_network.models import BusinessReferral, ReferralStatus
from app.modules.commissions.models import Commission, CommissionRule, CommissionRuleScope, CommissionSource, CommissionStatus
from app.modules.commissions.schemas import CommissionRuleCreate, EarningsSummary
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerRole, User

# Fallback rates used only if no matching CommissionRule row exists at all (shouldn't
# happen once the Sprint 14-15 migration seeds a CATEGORY rule per item type — this is
# a safety net, not the primary mechanism, unlike the flat dict it replaces).
_LEGACY_DEFAULTS: dict[BookingItemType, Decimal] = {
    BookingItemType.TOUR_DEPARTURE: Decimal("0.10"),
    BookingItemType.ROOM_TYPE: Decimal("0.12"),
    BookingItemType.CUSTOM_BID: Decimal("0.10"),
}
_DEFAULT_NETWORK_RATE = Decimal("0.02")


async def _partner_role_for_item(db: AsyncSession, item: BookingItem) -> uuid.UUID | None:
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
        from app.modules.bidding.models import TourBid

        result = await db.execute(select(TourBid.local_expert_role_id).where(TourBid.id == item.custom_bid_id))
        return result.scalar_one_or_none()
    return None


async def _resolve_direct_rate(
    db: AsyncSession, item_type: BookingItemType, partner_role_id: uuid.UUID
) -> tuple[Decimal, CommissionRule | None]:
    """PARTNER-scope override (item-type-specific, then blanket) beats CATEGORY-scope,
    which beats the hardcoded legacy default — priority resolution, most specific wins."""
    result = await db.execute(
        select(CommissionRule).where(
            CommissionRule.scope == CommissionRuleScope.PARTNER,
            CommissionRule.partner_role_id == partner_role_id,
            CommissionRule.item_type == item_type,
            CommissionRule.is_active.is_(True),
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        result = await db.execute(
            select(CommissionRule).where(
                CommissionRule.scope == CommissionRuleScope.PARTNER,
                CommissionRule.partner_role_id == partner_role_id,
                CommissionRule.item_type.is_(None),
                CommissionRule.is_active.is_(True),
            )
        )
        rule = result.scalar_one_or_none()
    if rule is None:
        result = await db.execute(
            select(CommissionRule).where(
                CommissionRule.scope == CommissionRuleScope.CATEGORY,
                CommissionRule.item_type == item_type,
                CommissionRule.is_active.is_(True),
            )
        )
        rule = result.scalar_one_or_none()
    if rule is None:
        return _LEGACY_DEFAULTS[item_type], None
    return rule.rate, rule


async def _resolve_network_rate(db: AsyncSession) -> tuple[Decimal, CommissionRule | None]:
    result = await db.execute(
        select(CommissionRule).where(CommissionRule.scope == CommissionRuleScope.NETWORK, CommissionRule.is_active.is_(True))
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        return _DEFAULT_NETWORK_RATE, None
    return rule.rate, rule


async def _approved_referral_for_partner(db: AsyncSession, partner_role_id: uuid.UUID) -> BusinessReferral | None:
    result = await db.execute(
        select(BusinessReferral).where(
            BusinessReferral.linked_partner_role_id == partner_role_id, BusinessReferral.status == ReferralStatus.APPROVED
        )
    )
    return result.scalar_one_or_none()


async def create_commissions_for_booking(db: AsyncSession, booking: Booking) -> None:
    """Called once, when a booking's payment is validated. Idempotency is the
    caller's responsibility (payments/service.py only calls this on the PENDING_PAYMENT
    -> CONFIRMED transition, which happens exactly once per booking)."""
    for item in booking.items:
        partner_role_id = await _partner_role_for_item(db, item)
        if partner_role_id is None:
            continue  # shouldn't happen for a valid item, but don't block payment confirmation on it

        rate, rule = await _resolve_direct_rate(db, item.item_type, partner_role_id)
        commission_amount = (item.subtotal * rate).quantize(Decimal("0.01"))
        db.add(
            Commission(
                booking_item_id=item.id,
                partner_role_id=partner_role_id,
                source=CommissionSource.DIRECT,
                rule_id=rule.id if rule else None,
                gross_amount=item.subtotal,
                rate=rate,
                commission_amount=commission_amount,
                partner_net_amount=item.subtotal - commission_amount,
            )
        )

        referral = await _approved_referral_for_partner(db, partner_role_id)
        if referral is not None:
            network_rate, network_rule = await _resolve_network_rate(db)
            network_amount = (item.subtotal * network_rate).quantize(Decimal("0.01"))
            db.add(
                Commission(
                    booking_item_id=item.id,
                    partner_role_id=referral.referring_expert_role_id,
                    source=CommissionSource.NETWORK,
                    rule_id=network_rule.id if network_rule else None,
                    gross_amount=item.subtotal,
                    rate=network_rate,
                    commission_amount=network_amount,
                    # A NETWORK row's "net" is the whole cut — there's no further split
                    # of a referral commission the way a DIRECT commission splits
                    # gross revenue between Ovigo and the partner.
                    partner_net_amount=network_amount,
                )
            )


async def mark_payable_for_booking(db: AsyncSession, booking: Booking) -> None:
    """Called when a booking completes (checkout) — the partner has now actually
    delivered the service, so their commission (and any linked NETWORK commission)
    moves from PENDING to PAYABLE."""
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
    total_net_paid = sum((c.partner_net_amount for c in commissions if c.status == CommissionStatus.PAID), Decimal("0"))
    return EarningsSummary(
        total_gross=total_gross,
        total_commission=total_commission,
        total_net_pending=total_net_pending,
        total_net_payable=total_net_payable,
        total_net_paid=total_net_paid,
        commissions=commissions,
    )


# --- Admin: commission rule management ---


async def list_rules(db: AsyncSession) -> list[CommissionRule]:
    result = await db.execute(select(CommissionRule).order_by(CommissionRule.created_at.desc()))
    return list(result.scalars().all())


async def create_rule(db: AsyncSession, admin: User, payload: CommissionRuleCreate) -> CommissionRule:
    rule = CommissionRule(**payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await audit.record(
        db,
        actor_id=admin.id,
        action="commission_rule.create",
        entity_type="commission_rule",
        entity_id=rule.id,
        extra={"scope": rule.scope.value, "rate": str(rule.rate)},
    )
    return rule


async def deactivate_rule(db: AsyncSession, admin: User, rule_id: uuid.UUID) -> CommissionRule:
    from app.core.exceptions import NotFoundError

    result = await db.execute(select(CommissionRule).where(CommissionRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise NotFoundError("Commission rule not found")
    rule.is_active = False
    await db.commit()
    await audit.record(db, actor_id=admin.id, action="commission_rule.deactivate", entity_type="commission_rule", entity_id=rule.id)
    await db.refresh(rule)
    return rule
