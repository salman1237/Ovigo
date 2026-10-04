"""Commission calculation with a configurable, priority-resolved rules engine.
See models.py for the overall design (DIRECT vs NETWORK commission, rule scopes,
guide-fee rows).
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType, BookingStatus
from app.modules.commissions.models import Commission, CommissionRule, CommissionRuleScope, CommissionSource, CommissionStatus
from app.modules.commissions.schemas import CommissionPreviewRequest, CommissionPreviewResponse, CommissionRuleCreate, EarningsSummary
from app.modules.referrals import service as referrals_service
from app.modules.referrals.models import AttributionStatus, NetworkAttribution
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, User


def _currently_effective(query, today: date | None = None):
    """Restricts a CommissionRule query to rows whose effective/expiry window
    covers today — a rule with no effective_date is active since creation, no
    expiry_date means it doesn't self-expire."""
    today = today or date.today()
    return query.where(
        or_(CommissionRule.effective_date.is_(None), CommissionRule.effective_date <= today),
        or_(CommissionRule.expiry_date.is_(None), CommissionRule.expiry_date >= today),
    )

# Fallback rates used only if no matching CommissionRule row exists at all (the Phase
# 9.3 migration seeds a 12% CATEGORY rule per item type — this is a safety net, not
# the primary mechanism). Ovigo charges 12% on every sale in every channel.
_PLATFORM_RATE = Decimal("0.12")
_LEGACY_DEFAULTS: dict[BookingItemType, Decimal] = {item_type: _PLATFORM_RATE for item_type in BookingItemType}
_DEFAULT_NETWORK_RATE = Decimal("0.02")
_DEFAULT_CURATION_RATE = Decimal("0.02")


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
    if item.item_type == BookingItemType.RIDE_BID and item.ride_bid_id:
        from app.modules.ride_requests.models import RideBid

        result = await db.execute(select(RideBid.rent_a_car_role_id).where(RideBid.id == item.ride_bid_id))
        return result.scalar_one_or_none()
    if item.item_type == BookingItemType.GUIDE_SERVICE and item.guide_package_id:
        from app.modules.guides.models import GuideServicePackage

        result = await db.execute(
            select(GuideServicePackage.guide_role_id).where(GuideServicePackage.id == item.guide_package_id)
        )
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


async def _resolve_scoped_rate(
    db: AsyncSession, scope: CommissionRuleScope, item_type: BookingItemType, default: Decimal
) -> tuple[Decimal, CommissionRule | None]:
    """For the platform-wide scopes (NETWORK, CURATION): an item-type-specific rule
    beats the scope-wide one (item_type NULL), which beats the hardcoded default."""
    base = select(CommissionRule).where(CommissionRule.scope == scope, CommissionRule.is_active.is_(True))
    rule = await _most_recently_effective(db, _currently_effective(base.where(CommissionRule.item_type == item_type)))
    if rule is None:
        rule = await _most_recently_effective(db, _currently_effective(base.where(CommissionRule.item_type.is_(None))))
    if rule is None:
        return default, None
    return rule.rate, rule


async def _resolve_network_rate(
    db: AsyncSession, item_type: BookingItemType
) -> tuple[Decimal, CommissionRule | None]:
    return await _resolve_scoped_rate(db, CommissionRuleScope.NETWORK, item_type, _DEFAULT_NETWORK_RATE)


async def _earning_attribution_for(
    db: AsyncSession, partner_role_id: uuid.UUID, at: datetime, booker_user_id: uuid.UUID | None
) -> NetworkAttribution | None:
    """The NetworkAttribution (referrals/models.py) that earns a referring expert a
    NETWORK cut on this partner's item, or None. All of these must hold:
    - the attribution is ACTIVE and `at` (when the traveler booked) falls inside its
      commission window — no commission after the agreement expires (PRD §12.5);
    - the referring expert still holds an APPROVED role — a suspended expert stops
      earning;
    - the booker isn't the referring expert themself — no farming referral
      commission off your own bookings of a partner you referred."""
    result = await db.execute(
        select(NetworkAttribution).where(
            NetworkAttribution.referred_partner_role_id == partner_role_id,
            NetworkAttribution.status == AttributionStatus.ACTIVE,
        )
    )
    attribution = result.scalar_one_or_none()
    if attribution is None or not referrals_service.is_earning(attribution, at):
        return None
    expert = (
        await db.execute(
            select(PartnerRole.status, PartnerAccount.user_id)
            .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
            .where(PartnerRole.id == attribution.referring_expert_role_id)
        )
    ).one_or_none()
    if expert is None or expert.status != PartnerRoleStatus.APPROVED:
        return None
    if booker_user_id is not None and expert.user_id == booker_user_id:
        return None
    return attribution


async def _network_cut(
    db: AsyncSession,
    attribution: NetworkAttribution,
    item_type: BookingItemType,
    gross_amount: Decimal,
    direct_commission_amount: Decimal,
) -> tuple[Decimal, Decimal, CommissionRule | None]:
    """(rate, amount, rule). The cut is paid out of Ovigo's own DIRECT commission on
    the same item — never out of the partner's earnings — so it's capped at that
    commission: Ovigo can at worst break even on an item, never pay out more than
    it took. `rate` is the configured rate; `amount` reflects the cap."""
    if attribution.custom_commission_rate is not None:
        rate, rule = attribution.custom_commission_rate, None
    else:
        rate, rule = await _resolve_network_rate(db, item_type)
    amount = min((gross_amount * rate).quantize(Decimal("0.01")), direct_commission_amount)
    return rate, amount, rule


async def _curation_cut(
    db: AsyncSession,
    item: BookingItem,
    partner_role_id: uuid.UUID,
    booker_user_id: uuid.UUID,
    gross_amount: Decimal,
) -> tuple[uuid.UUID, Decimal, Decimal, CommissionRule | None] | None:
    """(curating expert role, rate, uncapped amount, rule) for a stay booked through
    a tour that includes it (bookings/service.py sets `curated_by_tour_id`), or None.
    No cut when the curating expert owns the stay themself (they already earn the
    DIRECT commission on it), books it themself, or is no longer approved."""
    if item.curated_by_tour_id is None:
        return None
    expert = (
        await db.execute(
            select(Tour.local_expert_role_id, PartnerRole.status, PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.id == Tour.local_expert_role_id)
            .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
            .where(Tour.id == item.curated_by_tour_id)
        )
    ).one_or_none()
    if expert is None or expert.status != PartnerRoleStatus.APPROVED:
        return None
    if expert.local_expert_role_id == partner_role_id or expert.user_id == booker_user_id:
        return None
    rate, rule = await _resolve_scoped_rate(db, CommissionRuleScope.CURATION, item.item_type, _DEFAULT_CURATION_RATE)
    return expert.local_expert_role_id, rate, (gross_amount * rate).quantize(Decimal("0.01")), rule


async def preview_commission(db: AsyncSession, payload: CommissionPreviewRequest) -> CommissionPreviewResponse:
    """A dry run of the exact same resolution logic create_commissions_for_booking
    uses, for a hypothetical gross_amount — no Commission row is written. Lets an
    admin answer "what would this partner actually earn/pay right now" before a
    real booking exists, e.g. while deciding whether a proposed rule change or a
    new PARTNER-scope override rate is what they intended."""
    rate, rule = await _resolve_direct_rate(db, payload.item_type, payload.partner_role_id)
    commission_amount = (payload.gross_amount * rate).quantize(Decimal("0.01"))

    network_rate = network_amount = network_rule_id = network_referring_role_id = None
    attribution = await _earning_attribution_for(
        db, payload.partner_role_id, datetime.now(timezone.utc), booker_user_id=None
    )
    if attribution is not None:
        network_rate, network_amount, network_rule = await _network_cut(
            db, attribution, payload.item_type, payload.gross_amount, commission_amount
        )
        network_rule_id = network_rule.id if network_rule else None
        network_referring_role_id = attribution.referring_expert_role_id

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

        # Extra cuts on top of the partner's own DIRECT row, all funded out of Ovigo's
        # DIRECT commission and so jointly capped at it: a referring expert's NETWORK
        # cut and a curating expert's CURATION cut (PRD §12.4).
        extra: list[Commission] = []
        attribution = await _earning_attribution_for(
            db, partner_role_id, booking.created_at or datetime.now(timezone.utc), booker_user_id=booking.user_id
        )
        if attribution is not None:
            network_rate, network_amount, network_rule = await _network_cut(
                db, attribution, item.item_type, item.subtotal, commission_amount
            )
            if network_amount > 0:
                extra.append(
                    Commission(
                        booking_item_id=item.id,
                        partner_role_id=attribution.referring_expert_role_id,
                        source=CommissionSource.NETWORK,
                        rule_id=network_rule.id if network_rule else None,
                        attribution_id=attribution.id,
                        gross_amount=item.subtotal,
                        rate=network_rate,
                        commission_amount=network_amount,
                        # A NETWORK row's "net" is the whole cut — there's no further split
                        # of a referral commission the way a DIRECT commission splits
                        # gross revenue between Ovigo and the partner.
                        partner_net_amount=network_amount,
                    )
                )

        curation = await _curation_cut(db, item, partner_role_id, booking.user_id, item.subtotal)
        if curation is not None:
            curator_role_id, curation_rate, curation_amount, curation_rule = curation
            same_expert = [c for c in extra if c.partner_role_id == curator_role_id]
            if same_expert:
                # One expert who both referred this partner and curated the stay is
                # paid the higher of the two cuts, never both.
                if curation_amount > same_expert[0].commission_amount:
                    extra.remove(same_expert[0])
                else:
                    curation_amount = Decimal("0")
            already = sum((c.commission_amount for c in extra), Decimal("0"))
            curation_amount = min(curation_amount, commission_amount - already)
            if curation_amount > 0:
                extra.append(
                    Commission(
                        booking_item_id=item.id,
                        partner_role_id=curator_role_id,
                        source=CommissionSource.CURATION,
                        rule_id=curation_rule.id if curation_rule else None,
                        gross_amount=item.subtotal,
                        rate=curation_rate,
                        commission_amount=curation_amount,
                        partner_net_amount=curation_amount,
                    )
                )
        for row in extra:
            db.add(row)


async def mark_payable_for_booking(db: AsyncSession, booking: Booking) -> None:
    """Called when a booking completes (checkout) — the partner has now actually
    delivered the service, so their commission (and any linked NETWORK commission)
    moves from PENDING to PAYABLE. A completed tour booking can also release the
    guide fees on its departure (see sync_guide_fee_status)."""
    item_ids = [item.id for item in booking.items]
    if not item_ids:
        return
    result = await db.execute(select(Commission).where(Commission.booking_item_id.in_(item_ids)))
    for commission in result.scalars().all():
        # ON_HOLD commissions are frozen by an open dispute — leave them alone until
        # the dispute resolves (disputes/service.py releases or cancels the hold).
        if commission.status == CommissionStatus.PENDING:
            commission.status = CommissionStatus.PAYABLE
    await sync_guide_fee_status(db, departure_ids_of(booking))


# --- Guide fees (Phase 9.3): an expert hiring a guide for a departure, paid through Ovigo ---


def departure_ids_of(booking: Booking) -> set[uuid.UUID]:
    return {
        item.tour_departure_id
        for item in booking.items
        if item.item_type == BookingItemType.TOUR_DEPARTURE and item.tour_departure_id
    }


async def create_guide_fee_commissions(db: AsyncSession, assignment) -> None:
    """Called once, when the guide completes an expert's assignment
    (guides/service.py::complete_assignment). A fee is a guide-service sale with the
    assigning expert as the buyer, so it's charged like one:
    - the guide earns the fee minus Ovigo's commission (the GUIDE_SERVICE rate, 12%
      unless an admin set an override for this guide) — a GUIDE_FEE row;
    - the assigning expert pays the whole fee: a GUIDE_FEE_DEDUCTION row with a
      negative net, so it comes out of what Ovigo owes that expert;
    - the expert who onboarded the guide earns their NETWORK cut out of Ovigo's
      commission, exactly as on a traveler's booking — except when they're the
      assigning expert themself (no referral commission on your own purchase:
      _earning_attribution_for treats the assigning expert as the booker).
    Rows start PENDING; sync_guide_fee_status decides when they're payable.
    `assignment` is a guides.models.GuideAssignment (not imported here: the guides
    module imports this one)."""
    fee = assignment.fee_amount
    if fee is None or fee <= 0:
        return
    guide_role_id = assignment.guide_role_id
    rate, rule = await _resolve_direct_rate(db, BookingItemType.GUIDE_SERVICE, guide_role_id)
    commission_amount = (fee * rate).quantize(Decimal("0.01"))
    db.add(
        Commission(
            guide_assignment_id=assignment.id,
            partner_role_id=guide_role_id,
            source=CommissionSource.GUIDE_FEE,
            rule_id=rule.id if rule else None,
            gross_amount=fee,
            rate=rate,
            commission_amount=commission_amount,
            partner_net_amount=fee - commission_amount,
        )
    )
    db.add(
        Commission(
            guide_assignment_id=assignment.id,
            partner_role_id=assignment.assigned_by_role_id,
            source=CommissionSource.GUIDE_FEE_DEDUCTION,
            gross_amount=fee,
            rate=Decimal("0"),
            commission_amount=Decimal("0"),
            partner_net_amount=-fee,
        )
    )
    buyer_user_id = (
        await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == assignment.assigned_by_role_id)
        )
    ).scalar_one_or_none()
    attribution = await _earning_attribution_for(
        db, guide_role_id, assignment.created_at or datetime.now(timezone.utc), booker_user_id=buyer_user_id
    )
    if attribution is not None:
        network_rate, network_amount, network_rule = await _network_cut(
            db, attribution, BookingItemType.GUIDE_SERVICE, fee, commission_amount
        )
        if network_amount > 0:
            db.add(
                Commission(
                    guide_assignment_id=assignment.id,
                    partner_role_id=attribution.referring_expert_role_id,
                    source=CommissionSource.NETWORK,
                    rule_id=network_rule.id if network_rule else None,
                    attribution_id=attribution.id,
                    gross_amount=fee,
                    rate=network_rate,
                    commission_amount=network_amount,
                    partner_net_amount=network_amount,
                )
            )
    await db.flush()


async def sync_guide_fee_status(db: AsyncSession, departure_ids: set[uuid.UUID]) -> None:
    """Puts every not-yet-paid guide-fee row on these departures into the state the
    client's rule says (Phase 9.3 decision 4a): held while any paid booking on the
    departure has an open dispute; otherwise payable once the guide has completed
    the assignment and every paid booking on the departure has completed (or been
    cancelled); otherwise pending. A departure nobody booked releases its guide fees
    as soon as the guide completes — the expert hired them either way.

    Recomputed from scratch, so it's safe to call after anything that can change
    the answer: the guide completing, a tour booking completing or being
    cancelled, a dispute opening or resolving. PAID and CANCELLED rows are final
    and never touched."""
    if not departure_ids:
        return
    from app.modules.disputes.models import Dispute, DisputeStatus

    await db.flush()  # the session doesn't autoflush; the queries below must see the caller's changes
    from app.modules.guides.models import AssignmentStatus, GuideAssignment

    rows = (
        await db.execute(
            select(Commission, GuideAssignment.status, GuideAssignment.tour_departure_id)
            .join(GuideAssignment, GuideAssignment.id == Commission.guide_assignment_id)
            .where(
                GuideAssignment.tour_departure_id.in_(departure_ids),
                Commission.status.in_([CommissionStatus.PENDING, CommissionStatus.PAYABLE, CommissionStatus.ON_HOLD]),
            )
        )
    ).all()
    if not rows:
        return

    live_booking = Booking.status.notin_([BookingStatus.PENDING_PAYMENT, BookingStatus.CANCELLED])
    disputed = set(
        (
            await db.execute(
                select(BookingItem.tour_departure_id)
                .join(Booking, Booking.id == BookingItem.booking_id)
                .join(Dispute, Dispute.booking_id == Booking.id)
                .where(
                    BookingItem.tour_departure_id.in_(departure_ids),
                    Dispute.status == DisputeStatus.OPEN,
                    live_booking,
                )
            )
        ).scalars().all()
    )
    in_progress = set(
        (
            await db.execute(
                select(BookingItem.tour_departure_id)
                .join(Booking, Booking.id == BookingItem.booking_id)
                .where(
                    BookingItem.tour_departure_id.in_(departure_ids),
                    BookingItem.status.notin_([BookingItemStatus.COMPLETED, BookingItemStatus.CANCELLED]),
                    live_booking,
                )
            )
        ).scalars().all()
    )
    for commission, assignment_status, departure_id in rows:
        if departure_id in disputed:
            commission.status = CommissionStatus.ON_HOLD
        elif assignment_status == AssignmentStatus.COMPLETED and departure_id not in in_progress:
            commission.status = CommissionStatus.PAYABLE
        else:
            commission.status = CommissionStatus.PENDING


async def get_earnings_for_role(db: AsyncSession, role: PartnerRole) -> EarningsSummary:
    result = await db.execute(
        select(Commission).where(Commission.partner_role_id == role.id).order_by(Commission.created_at.desc())
    )
    commissions = list(result.scalars().all())
    # A guide fee an expert paid isn't a sale of theirs — it counts in their nets
    # (negative), not in their gross sales.
    total_gross = sum(
        (c.gross_amount for c in commissions if c.source != CommissionSource.GUIDE_FEE_DEDUCTION), Decimal("0")
    )
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
