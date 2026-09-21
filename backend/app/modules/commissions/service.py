"""Commission calculation with a configurable, priority-resolved rules engine.
See models.py for the overall design (DIRECT vs NETWORK commission, rule scopes).
"""
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType
from app.modules.business_network.models import BusinessReferral, ReferralStatus
from app.modules.commissions.models import Commission, CommissionRule, CommissionRuleScope, CommissionSource, CommissionStatus
from app.modules.commissions.schemas import CommissionPreviewRequest, CommissionPreviewResponse, CommissionRuleCreate, EarningsSummary
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerRole, User


def _currently_effective(query, today: date | None = None):
    """Restricts a CommissionRule query to rows whose effective/expiry window
    covers today — a rule with no effective_date is active since creation, no
    expiry_date means it doesn't self-expire."""
    today = today or date.today()
    return query.where(
        or_(CommissionRule.effective_date.is_(None), CommissionRule.effective_date <= today),
        or_(CommissionRule.expiry_date.is_(None), CommissionRule.expiry_date >= today),
    )

# Fallback rates used only if no matching CommissionRule row exists at all (shouldn't
# happen once the Sprint 14-15 migration seeds a CATEGORY rule per item type — this is
# a safety net, not the primary mechanism, unlike the flat dict it replaces).
_LEGACY_DEFAULTS: dict[BookingItemType, Decimal] = {
    BookingItemType.TOUR_DEPARTURE: Decimal("0.10"),
    BookingItemType.ROOM_TYPE: Decimal("0.12"),
    BookingItemType.CUSTOM_BID: Decimal("0.10"),
    BookingItemType.VEHICLE_RENTAL: Decimal("0.12"),
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
    if item.item_type == BookingItemType.VEHICLE_RENTAL and item.vehicle_id:
        from app.modules.rentcar.models import Vehicle

        result = await db.execute(select(Vehicle.rent_a_car_role_id).where(Vehicle.id == item.vehicle_id))
        return result.scalar_one_or_none()
    return None


async def _most_recently_effective(db: AsyncSession, query) -> CommissionRule | None:
    """Picks one deterministically when more than one currently-effective rule
    matches the same scope/item_type/partner (e.g. an old rate whose expiry_date
    hasn't been backfilled yet alongside a new one that just became effective) —
    the rule with the latest effective_date wins; ties fall back to the most
    recently created. Previously this used scalar_one_or_none(), which would
    raise if a second row ever matched; now that rules can overlap in time,
    picking the most-recent one is the correct default instead of erroring."""
    result = await db.execute(
        query.order_by(
            CommissionRule.effective_date.desc().nullslast(), CommissionRule.created_at.desc()
        ).limit(1)
    )
    return result.scalars().first()


async def _resolve_direct_rate(
    db: AsyncSession, item_type: BookingItemType, partner_role_id: uuid.UUID
) -> tuple[Decimal, CommissionRule | None]:
    """PARTNER-scope override (item-type-specific, then blanket) beats CATEGORY-scope,
    which beats the hardcoded legacy default — priority resolution, most specific wins."""
    rule = await _most_recently_effective(
        db,
        _currently_effective(
            select(CommissionRule).where(
                CommissionRule.scope == CommissionRuleScope.PARTNER,
                CommissionRule.partner_role_id == partner_role_id,
                CommissionRule.item_type == item_type,
                CommissionRule.is_active.is_(True),
            )
        ),
    )
    if rule is None:
        rule = await _most_recently_effective(
            db,
            _currently_effective(
                select(CommissionRule).where(
                    CommissionRule.scope == CommissionRuleScope.PARTNER,
                    CommissionRule.partner_role_id == partner_role_id,
                    CommissionRule.item_type.is_(None),
                    CommissionRule.is_active.is_(True),
                )
            ),
        )
    if rule is None:
        rule = await _most_recently_effective(
            db,
            _currently_effective(
                select(CommissionRule).where(
                    CommissionRule.scope == CommissionRuleScope.CATEGORY,
                    CommissionRule.item_type == item_type,
                    CommissionRule.is_active.is_(True),
                )
            ),
        )
    if rule is None:
        return _LEGACY_DEFAULTS[item_type], None
    return rule.rate, rule


async def _resolve_network_rate(db: AsyncSession) -> tuple[Decimal, CommissionRule | None]:
    rule = await _most_recently_effective(
        db,
        _currently_effective(
            select(CommissionRule).where(
                CommissionRule.scope == CommissionRuleScope.NETWORK, CommissionRule.is_active.is_(True)
            )
        ),
    )
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


async def preview_commission(db: AsyncSession, payload: CommissionPreviewRequest) -> CommissionPreviewResponse:
    """A dry run of the exact same resolution logic create_commissions_for_booking
    uses, for a hypothetical gross_amount — no Commission row is written. Lets an
    admin answer "what would this partner actually earn/pay right now" before a
    real booking exists, e.g. while deciding whether a proposed rule change or a
    new PARTNER-scope override rate is what they intended."""
    rate, rule = await _resolve_direct_rate(db, payload.item_type, payload.partner_role_id)
    commission_amount = (payload.gross_amount * rate).quantize(Decimal("0.01"))

    network_rate = network_amount = network_rule_id = network_referring_role_id = None
    referral = await _approved_referral_for_partner(db, payload.partner_role_id)
    if referral is not None:
        if referral.custom_commission_rate is not None:
            network_rate = referral.custom_commission_rate
            network_rule_id = None
        else:
            network_rate, network_rule = await _resolve_network_rate(db)
            network_rule_id = network_rule.id if network_rule else None
        network_amount = (payload.gross_amount * network_rate).quantize(Decimal("0.01"))
        network_referring_role_id = referral.referring_expert_role_id

    return CommissionPreviewResponse(
        direct_rate=rate,
        direct_rule_id=rule.id if rule else None,
        direct_commission_amount=commission_amount,
        direct_partner_net_amount=payload.gross_amount - commission_amount,
        network_rate=network_rate,
        network_rule_id=network_rule_id,
        network_commission_amount=network_amount,
        network_referring_role_id=network_referring_role_id,
    )


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
            if referral.custom_commission_rate is not None:
                network_rate, network_rule = referral.custom_commission_rate, None
            else:
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
        # ON_HOLD commissions are frozen by an open dispute — leave them alone until
        # the dispute resolves (disputes/service.py releases or cancels the hold).
        if commission.status == CommissionStatus.PENDING:
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
    total_net_on_hold = sum(
        (c.partner_net_amount for c in commissions if c.status == CommissionStatus.ON_HOLD), Decimal("0")
    )
    return EarningsSummary(
        total_gross=total_gross,
        total_commission=total_commission,
        total_net_pending=total_net_pending,
        total_net_payable=total_net_payable,
        total_net_paid=total_net_paid,
        total_net_on_hold=total_net_on_hold,
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
