"""Booking creation locks inventory synchronously (SELECT ... FOR UPDATE) inside the
same transaction the booking row is created in — this is what makes MVP acceptance
criterion #8 ("a booking cannot exceed available inventory") actually true under
concurrent requests, not just in the happy path.

Known simplification: a PENDING_PAYMENT booking holds its inventory indefinitely if
the traveler never completes payment — there's no background job releasing stale
holds. The technical document's stack includes Celery+Redis for exactly this kind
of thing, but no Redis instance is provisioned yet. Tracked as follow-up work
alongside Sprint 9's "performance optimization, caching" — for now, an admin can
manually cancel a stuck booking to release its hold.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.modules.bookings.models import (
    AcquisitionChannel,
    Booking,
    BookingGuest,
    BookingItem,
    BookingItemStatus,
    BookingItemType,
    BookingStatus,
    BookingStatusHistory,
)
from app.modules.bookings.schemas import BookingCreate, BookingItemCreate, FrontDeskBookingCreate
from app.modules.fraud import service as fraud_service
from app.modules.loyalty import service as loyalty_service
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.promotions import service as promotions_service
from app.modules.ads.models import AdCampaign, AdCampaignStatus
from app.modules.locations.models import TaggableEntityType
from app.modules.referrals.models import ExpertReferralLink
from app.modules.rentcar.models import Vehicle, VehicleAvailability, VehicleStatus
from app.modules.stays import service as stays_service
from app.modules.stays.models import AvailabilityCalendar, HousekeepingStatus, Property, PropertyStatus, Room, RoomType
from app.modules.tours.models import Tour, TourDeparture, TourStatus, TourStay
from app.modules.tours.service import PUBLIC_TOUR_STATUSES
from app.modules.users.models import SystemRole, User

_EAGER = (
    selectinload(Booking.items),
    selectinload(Booking.guests),
)

# Dynamic packaging (Sprint 25-26): an automatic discount for a booking that spans
# this many distinct bookable item types (tour_departure/room_type/vehicle_rental —
# custom_bid is never bundle-eligible, see BookingItemCreate's own validator that
# already rejects it on this endpoint). Keyed by distinct-type count, not a flat
# rate, so bundling all three verticals is worth meaningfully more than just two —
# see bookings/models.py's module docstring for how this interacts with commission.
BUNDLE_ELIGIBLE_TYPES = {BookingItemType.TOUR_DEPARTURE, BookingItemType.ROOM_TYPE, BookingItemType.VEHICLE_RENTAL}
BUNDLE_DISCOUNT_RATES: dict[int, Decimal] = {2: Decimal("0.05"), 3: Decimal("0.10")}


class Reserved(NamedTuple):
    """What reserving one item yields: its price, who owns the listing (the default
    seller, PRD §12.5), and which advertisable entity it is — so a sponsored-ad click
    can be matched to it (`_acquisition_for`)."""

    unit_price: Decimal
    subtotal: Decimal
    owner_role_id: uuid.UUID
    entity_type: TaggableEntityType | None  # None: not something a sponsored ad can advertise
    entity_id: uuid.UUID


async def _reserve_tour_departure(db: AsyncSession, item: BookingItemCreate) -> Reserved:
    result = await db.execute(
        select(TourDeparture).where(TourDeparture.id == item.tour_departure_id).with_for_update()
    )
    departure = result.scalar_one_or_none()
    if departure is None:
        raise NotFoundError("Tour departure not found")

    tour_result = await db.execute(select(Tour).where(Tour.id == departure.tour_id))
    tour = tour_result.scalar_one_or_none()
    if tour is None or tour.status != TourStatus.PUBLISHED:
        raise ConflictError("This tour is not available for booking")
    if departure.available_seats < item.quantity:
        raise ConflictError(f"Only {departure.available_seats} seat(s) left on this departure")

    departure.available_seats -= item.quantity
    unit_price = departure.price_override or tour.base_price
    return Reserved(unit_price, unit_price * item.quantity, tour.local_expert_role_id, TaggableEntityType.TOUR, tour.id)


async def _release_tour_departure(db: AsyncSession, departure_id: uuid.UUID, quantity: int) -> None:
    result = await db.execute(select(TourDeparture).where(TourDeparture.id == departure_id).with_for_update())
    departure = result.scalar_one_or_none()
    if departure is not None:
        departure.available_seats += quantity


def _date_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days)]


async def _reserve_room(db: AsyncSession, item: BookingItemCreate) -> Reserved:
    room_result = await db.execute(select(RoomType).where(RoomType.id == item.room_type_id))
    room = room_result.scalar_one_or_none()
    if room is None:
        raise NotFoundError("Room type not found")

    prop_result = await db.execute(select(Property).where(Property.id == room.property_id))
    prop = prop_result.scalar_one_or_none()
    if prop is None or prop.status != PropertyStatus.PUBLISHED:
        raise ConflictError("This property is not available for booking")

    nights = _date_range(item.check_in_date, item.check_out_date)
    if room.min_stay_nights and len(nights) < room.min_stay_nights:
        raise ConflictError(f"This room type requires a minimum stay of {room.min_stay_nights} night(s)")

    result = await db.execute(
        select(AvailabilityCalendar)
        .where(AvailabilityCalendar.room_type_id == item.room_type_id, AvailabilityCalendar.date.in_(nights))
        .with_for_update()
    )
    rows = {row.date: row for row in result.scalars().all()}
    missing = [d for d in nights if d not in rows]
    if missing:
        raise ConflictError(f"Availability not set for {missing[0].isoformat()} — ask the host to open the calendar")
    short = [d for d in nights if rows[d].available_units < item.quantity]
    if short:
        raise ConflictError(f"Not enough rooms available on {short[0].isoformat()}")

    days_before_checkin = (item.check_in_date - date.today()).days
    subtotal = Decimal("0")
    for d in nights:
        row = rows[d]
        if row.price_override is not None:
            nightly_rate = row.price_override
        else:
            nightly_rate = await stays_service.resolve_nightly_rate(
                db, item.room_type_id, room.base_price, d, days_before_checkin, item.quantity
            )
        subtotal += nightly_rate * item.quantity
        row.available_units -= item.quantity

    return Reserved(room.base_price, subtotal, prop.host_role_id, TaggableEntityType.PROPERTY, prop.id)


async def _room_tax_and_service_charge(db: AsyncSession, room_type_id: uuid.UUID, subtotal: Decimal) -> Decimal:
    """Computed on the room subtotal only (see stays/models.py docstring) — kept out of
    BookingItem.subtotal since Commission.gross_amount is derived from it."""
    result = await db.execute(
        select(Property.tax_rate, Property.service_charge_rate)
        .join(RoomType, RoomType.property_id == Property.id)
        .where(RoomType.id == room_type_id)
    )
    row = result.one_or_none()
    if row is None:
        return Decimal("0")
    tax_rate, service_charge_rate = row
    rate = (tax_rate or Decimal("0")) + (service_charge_rate or Decimal("0"))
    if rate == 0:
        return Decimal("0")
    return (subtotal * rate / Decimal("100")).quantize(Decimal("0.01"))


async def _reserve_vehicle(db: AsyncSession, item: BookingItemCreate) -> Reserved:
    vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == item.vehicle_id).with_for_update())
    vehicle = vehicle_result.scalar_one_or_none()
    if vehicle is None or vehicle.status != VehicleStatus.PUBLISHED:
        raise ConflictError("This vehicle is not available for booking")

    days = _date_range(item.check_in_date, item.check_out_date)
    result = await db.execute(
        select(VehicleAvailability)
        .where(VehicleAvailability.vehicle_id == item.vehicle_id, VehicleAvailability.date.in_(days))
        .with_for_update()
    )
    rows = {row.date: row for row in result.scalars().all()}
    missing = [d for d in days if d not in rows]
    if missing:
        raise ConflictError(f"Availability not set for {missing[0].isoformat()} — ask the owner to open the calendar")
    unavailable = [d for d in days if not rows[d].is_available]
    if unavailable:
        raise ConflictError(f"Vehicle is not available on {unavailable[0].isoformat()}")

    for row in rows.values():
        row.is_available = False

    subtotal = vehicle.price_per_day * len(days)
    return Reserved(vehicle.price_per_day, subtotal, vehicle.rent_a_car_role_id, TaggableEntityType.VEHICLE, vehicle.id)


async def _reserve_guide_service(db: AsyncSession, item: BookingItemCreate) -> Reserved:
    from app.modules.guides import service as guides_service  # guides imports bookings models

    package = await guides_service.reserve_guide_service(db, item.guide_package_id, item.check_in_date)
    return Reserved(package.price, package.price, package.guide_role_id, None, package.id)


async def _curating_tour(db: AsyncSession, item: BookingItemCreate) -> Tour | None:
    """The tour a stay is being booked through, if `via_tour_id` names a publicly
    listed tour that really does include this room's property. Anything else is
    ignored rather than failing the booking — e.g. the expert removed the stay from
    the tour after the traveler put it in their cart."""
    if item.via_tour_id is None:
        return None
    tour = (await db.execute(select(Tour).where(Tour.id == item.via_tour_id))).scalar_one_or_none()
    if tour is None or tour.status not in PUBLIC_TOUR_STATUSES:
        return None
    linked = await db.execute(
        select(TourStay.id)
        .join(RoomType, RoomType.property_id == TourStay.property_id)
        .where(TourStay.tour_id == tour.id, RoomType.id == item.room_type_id)
        .limit(1)
    )
    return tour if linked.scalar_one_or_none() is not None else None


async def _acquisition_for(
    db: AsyncSession,
    user: User,
    ad_campaign_id: uuid.UUID | None = None,
    entities: set[tuple[TaggableEntityType, uuid.UUID]] | None = None,
) -> tuple[AcquisitionChannel, uuid.UUID | None, uuid.UUID | None]:
    """(channel, acquiring expert role, ad campaign) — PRD §12.5 "whether the
    customer was acquired organically, through an Expert or through advertising".
    An ad click only counts when that campaign actually advertises one of the
    booked items (a client can't attribute a booking to an arbitrary campaign);
    otherwise a traveler who registered through an expert's referral link is that
    expert's; otherwise organic."""
    if ad_campaign_id is not None and entities:
        campaign = (await db.execute(select(AdCampaign).where(AdCampaign.id == ad_campaign_id))).scalar_one_or_none()
        if (
            campaign is not None
            and campaign.status in (AdCampaignStatus.ACTIVE, AdCampaignStatus.PAUSED, AdCampaignStatus.COMPLETED)
            and (campaign.entity_type, campaign.entity_id) in entities
        ):
            return AcquisitionChannel.ADVERTISING, None, campaign.id
    if user.signup_referral_link_id is not None:
        expert_role_id = (
            await db.execute(
                select(ExpertReferralLink.expert_role_id).where(ExpertReferralLink.id == user.signup_referral_link_id)
            )
        ).scalar_one_or_none()
        if expert_role_id is not None:
            return AcquisitionChannel.EXPERT, expert_role_id, None
    return AcquisitionChannel.ORGANIC, None, None


async def _release_vehicle(db: AsyncSession, vehicle_id: uuid.UUID, check_in: date, check_out: date) -> None:
    days = _date_range(check_in, check_out)
    result = await db.execute(
        select(VehicleAvailability)
        .where(VehicleAvailability.vehicle_id == vehicle_id, VehicleAvailability.date.in_(days))
        .with_for_update()
    )
    for row in result.scalars().all():
        row.is_available = True


async def create_booking(db: AsyncSession, user: User, payload: BookingCreate) -> Booking:
    if not payload.items:
        raise ConflictError("A booking needs at least one item")

    total = Decimal("0")
    tax_service_total = Decimal("0")
    bundle_eligible_subtotal = Decimal("0")
    prepared: list[tuple[BookingItemCreate, Reserved, Tour | None]] = []
    for item in payload.items:
        tax_service = Decimal("0")
        curating_tour = None
        if item.item_type == BookingItemType.TOUR_DEPARTURE:
            reserved = await _reserve_tour_departure(db, item)
        elif item.item_type == BookingItemType.ROOM_TYPE:
            reserved = await _reserve_room(db, item)
            tax_service = await _room_tax_and_service_charge(db, item.room_type_id, reserved.subtotal)
            curating_tour = await _curating_tour(db, item)
        elif item.item_type == BookingItemType.VEHICLE_RENTAL:
            reserved = await _reserve_vehicle(db, item)
        elif item.item_type == BookingItemType.GUIDE_SERVICE:
            reserved = await _reserve_guide_service(db, item)
        else:
            # CUSTOM_BID is rejected by BookingItemCreate's own validator before
            # reaching here — this branch exists only so a future new item type
            # fails loudly instead of silently mis-dispatching.
            raise ConflictError(f"Cannot create a booking item of type {item.item_type.value} directly")
        await fraud_service.check_self_booking(db, user.id, item)
        prepared.append((item, reserved, curating_tour))
        total += reserved.subtotal + tax_service
        tax_service_total += tax_service
        if item.item_type in BUNDLE_ELIGIBLE_TYPES:
            bundle_eligible_subtotal += reserved.subtotal

    distinct_bundle_types = {item.item_type for item in payload.items} & BUNDLE_ELIGIBLE_TYPES
    bundle_discount_rate = BUNDLE_DISCOUNT_RATES.get(len(distinct_bundle_types), Decimal("0"))
    bundle_discount_amount = (bundle_eligible_subtotal * bundle_discount_rate).quantize(Decimal("0.01"))
    total -= bundle_discount_amount

    # Promo code, then loyalty points, each computed on the already-discounted
    # running total — see bookings/models.py's module docstring for the stacking
    # order and why both stay total_amount-only deductions. Both are only *validated*
    # here (no mutation yet) since neither service should touch the account/redemption
    # ledger until the booking row exists — see the two `apply_*` calls below.
    promo_discount_amount = Decimal("0")
    promo_code_row = None
    if payload.promo_code:
        promo_discount_amount, promo_code_row = await promotions_service.preview_redemption(
            db, user, payload.promo_code, total
        )
        total -= promo_discount_amount

    loyalty_discount_amount = Decimal("0")
    if payload.redeem_points > 0:
        loyalty_discount_amount = await loyalty_service.preview_redemption(db, user, payload.redeem_points, total)
        total -= loyalty_discount_amount

    channel, acquiring_expert_role_id, ad_campaign_id = await _acquisition_for(
        db, user, payload.ad_campaign_id, {(r.entity_type, r.entity_id) for _, r, _ in prepared if r.entity_type is not None}
    )
    booking = Booking(
        user_id=user.id,
        total_amount=total,
        tax_service_amount=tax_service_total,
        bundle_discount_amount=bundle_discount_amount,
        promo_discount_amount=promo_discount_amount,
        loyalty_discount_amount=loyalty_discount_amount,
        acquisition_channel=channel,
        acquisition_expert_role_id=acquiring_expert_role_id,
        ad_campaign_id=ad_campaign_id,
    )
    db.add(booking)
    await db.flush()

    if promo_code_row is not None:
        await promotions_service.apply_redemption(db, user, booking.id, promo_code_row, promo_discount_amount)
    if payload.redeem_points > 0:
        await loyalty_service.apply_redemption(db, user, booking.id, payload.redeem_points)

    for item, reserved, curating_tour in prepared:
        db.add(
            BookingItem(
                booking_id=booking.id,
                item_type=item.item_type,
                tour_departure_id=item.tour_departure_id,
                room_type_id=item.room_type_id,
                vehicle_id=item.vehicle_id,
                guide_package_id=item.guide_package_id,
                check_in_date=item.check_in_date,
                check_out_date=item.check_out_date,
                quantity=item.quantity,
                unit_price=reserved.unit_price,
                subtotal=reserved.subtotal,
                # Booked through a tour that includes it, the curating expert sold it.
                sold_by_role_id=curating_tour.local_expert_role_id if curating_tour else reserved.owner_role_id,
                curated_by_tour_id=curating_tour.id if curating_tour else None,
            )
        )
    for guest in payload.guests:
        db.add(BookingGuest(booking_id=booking.id, **guest.model_dump()))
    db.add(BookingStatusHistory(booking_id=booking.id, to_status=BookingStatus.PENDING_PAYMENT.value))

    await db.commit()
    return await get_own_booking_or_404(db, user, booking.id)


async def create_booking_from_bid(
    db: AsyncSession, user: User, bid_id: uuid.UUID, price: Decimal
) -> Booking:
    """Converts an accepted custom-tour bid straight into a real booking, so the
    entire existing payment/commission/escrow/notification pipeline applies to
    custom tours for free. Deliberately takes `price` as a plain argument rather
    than importing the bidding module's TourBid model — the caller
    (bidding/service.py) already has the bid loaded and re-validated as ACCEPTED
    before calling this, and passing the price explicitly avoids a
    bookings <-> bidding import cycle. No inventory to reserve here: a custom
    bid isn't drawn from a fixed departure or room pool, it's a one-off
    arrangement the expert already committed to when they placed the bid.
    """
    from app.modules.bidding.models import TourBid

    channel, acquiring_expert_role_id, _ = await _acquisition_for(db, user)
    seller = (await db.execute(select(TourBid.local_expert_role_id).where(TourBid.id == bid_id))).scalar_one_or_none()
    booking = Booking(
        user_id=user.id, total_amount=price,
        acquisition_channel=channel, acquisition_expert_role_id=acquiring_expert_role_id,
    )
    db.add(booking)
    await db.flush()

    db.add(
        BookingItem(
            booking_id=booking.id,
            item_type=BookingItemType.CUSTOM_BID,
            custom_bid_id=bid_id,
            sold_by_role_id=seller,
            quantity=1,
            unit_price=price,
            subtotal=price,
        )
    )
    db.add(BookingStatusHistory(booking_id=booking.id, to_status=BookingStatus.PENDING_PAYMENT.value))
    await db.commit()
    return await get_own_booking_or_404(db, user, booking.id)


async def create_booking_from_ride_bid(
    db: AsyncSession, user: User, bid_id: uuid.UUID, price: Decimal
) -> Booking:
    """Converts an accepted rent-a-car ride bid straight into a real booking —
    same reasoning as create_booking_from_bid above (kept as a separate sibling
    function, not a shared one, since the two bid tables have their own FK
    columns on BookingItem and this avoids a bookings <-> ride_requests import
    cycle the same way the tour-bid version avoids one with bidding)."""
    from app.modules.ride_requests.models import RideBid

    channel, acquiring_expert_role_id, _ = await _acquisition_for(db, user)
    seller = (await db.execute(select(RideBid.rent_a_car_role_id).where(RideBid.id == bid_id))).scalar_one_or_none()
    booking = Booking(
        user_id=user.id, total_amount=price,
        acquisition_channel=channel, acquisition_expert_role_id=acquiring_expert_role_id,
    )
    db.add(booking)
    await db.flush()

    db.add(
        BookingItem(
            booking_id=booking.id,
            item_type=BookingItemType.RIDE_BID,
            ride_bid_id=bid_id,
            sold_by_role_id=seller,
            quantity=1,
            unit_price=price,
            subtotal=price,
        )
    )
    db.add(BookingStatusHistory(booking_id=booking.id, to_status=BookingStatus.PENDING_PAYMENT.value))
    await db.commit()
    return await get_own_booking_or_404(db, user, booking.id)


async def get_own_booking_or_404(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id, Booking.user_id == user.id)
        .options(*_EAGER)
        .execution_options(populate_existing=True)
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise NotFoundError("Booking not found")
    return booking


async def list_my_bookings(db: AsyncSession, user: User) -> list[Booking]:
    result = await db.execute(
        select(Booking).where(Booking.user_id == user.id).options(*_EAGER).order_by(Booking.created_at.desc())
    )
    return list(result.scalars().all())


async def _add_status_history(db: AsyncSession, booking: Booking, to_status: BookingStatus, note: str | None = None) -> None:
    db.add(
        BookingStatusHistory(
            booking_id=booking.id, from_status=booking.status.value, to_status=to_status.value, note=note
        )
    )


async def _release_and_cancel(db: AsyncSession, booking: Booking, note: str | None = None) -> None:
    """Core cancel logic with no user/ownership check — used both by the traveler-
    facing cancel_booking below and by the payment module when a payment fails or is
    abandoned (there's no user context in an SSLCommerz callback)."""
    for item in booking.items:
        if item.item_type == BookingItemType.TOUR_DEPARTURE and item.tour_departure_id:
            await _release_tour_departure(db, item.tour_departure_id, item.quantity)
        elif item.item_type == BookingItemType.ROOM_TYPE and item.room_type_id and item.check_in_date and item.check_out_date:
            nights = _date_range(item.check_in_date, item.check_out_date)
            result = await db.execute(
                select(AvailabilityCalendar)
                .where(AvailabilityCalendar.room_type_id == item.room_type_id, AvailabilityCalendar.date.in_(nights))
                .with_for_update()
            )
            for row in result.scalars().all():
                row.available_units += item.quantity
        elif item.item_type == BookingItemType.VEHICLE_RENTAL and item.vehicle_id and item.check_in_date and item.check_out_date:
            await _release_vehicle(db, item.vehicle_id, item.check_in_date, item.check_out_date)
        # A guide service holds its date only while the item isn't cancelled, so
        # there's nothing to release for it.
        item.status = BookingItemStatus.CANCELLED

    if booking.loyalty_discount_amount and booking.loyalty_discount_amount > 0:
        await loyalty_service.refund_redeemed_points(db, booking)
    # Promo redemptions are deliberately NOT refunded on cancellation — see
    # promotions/models.py's module docstring for why (prevents a book-cancel-rebook
    # loop reusing a scarce, admin-controlled code).

    await _add_status_history(db, booking, BookingStatus.CANCELLED, note=note)
    booking.status = BookingStatus.CANCELLED
    # One fewer booking still running on its departures can release their guide fees.
    from app.modules.commissions import service as commissions_service  # avoid import cycle at module load

    await commissions_service.sync_guide_fee_status(db, commissions_service.departure_ids_of(booking))
    await notifications_service.notify(
        db,
        user_id=booking.user_id,
        type=NotificationType.BOOKING_CANCELLED,
        title="Booking cancelled",
        message=note or "Your booking has been cancelled.",
        link=f"/bookings/{booking.id}",
    )
    await fraud_service.check_rapid_cancellations(db, booking.user_id)
    await fraud_service.check_instant_cancellation_pattern(db, booking.user_id)


async def cancel_booking_by_id(db: AsyncSession, booking_id: uuid.UUID, note: str | None = None) -> None:
    """System-triggered cancel (no ownership check) — e.g. a failed/abandoned payment."""
    result = await db.execute(select(Booking).where(Booking.id == booking_id).options(*_EAGER))
    booking = result.scalar_one_or_none()
    if booking is None or booking.status not in (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED):
        return
    await _release_and_cancel(db, booking, note=note)
    await db.commit()


async def cancel_booking(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    booking = await get_own_booking_or_404(db, user, booking_id)
    if booking.status not in (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED):
        raise ConflictError(f"A {booking.status.value} booking cannot be cancelled")

    await _release_and_cancel(db, booking)
    await db.commit()
    return await get_own_booking_or_404(db, user, booking_id)


async def _mark_checked_in(db: AsyncSession, booking: Booking) -> None:
    if booking.status != BookingStatus.CONFIRMED:
        raise ConflictError(f"Booking must be confirmed to check in (currently {booking.status.value})")
    for item in booking.items:
        item.status = BookingItemStatus.CHECKED_IN
    await _add_status_history(db, booking, BookingStatus.CHECKED_IN)
    booking.status = BookingStatus.CHECKED_IN


async def _mark_checked_out(db: AsyncSession, booking: Booking) -> None:
    from app.modules.commissions import service as commissions_service  # avoid import cycle at module load

    if booking.status != BookingStatus.CHECKED_IN:
        raise ConflictError(f"Booking must be checked in before checking out (currently {booking.status.value})")
    for item in booking.items:
        item.status = BookingItemStatus.COMPLETED
        # A room whose stay just ended needs cleaning before its next guest — see
        # stays/models.py's Part 2 docstring on Room as an operational layer.
        if item.assigned_room_id:
            room_result = await db.execute(select(Room).where(Room.id == item.assigned_room_id))
            room = room_result.scalar_one_or_none()
            if room is not None:
                room.housekeeping_status = HousekeepingStatus.DIRTY
    await _add_status_history(db, booking, BookingStatus.CHECKED_OUT)
    await _add_status_history(db, booking, BookingStatus.COMPLETED, note="Auto-completed on checkout")
    booking.status = BookingStatus.COMPLETED
    await commissions_service.mark_payable_for_booking(db, booking)
    await loyalty_service.award_points_for_booking(db, booking)
    await notifications_service.notify(
        db,
        user_id=booking.user_id,
        type=NotificationType.BOOKING_COMPLETED,
        title="Booking completed",
        message="Your booking is complete. We'd love to hear about your experience — leave a review!",
        link=f"/bookings/{booking.id}",
    )


async def check_in(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    booking = await get_own_booking_or_404(db, user, booking_id)
    await _mark_checked_in(db, booking)
    await db.commit()
    return await get_own_booking_or_404(db, user, booking_id)


async def check_out(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    booking = await get_own_booking_or_404(db, user, booking_id)
    await _mark_checked_out(db, booking)
    await db.commit()
    return await get_own_booking_or_404(db, user, booking_id)


async def get_booking_or_404(db: AsyncSession, booking_id: uuid.UUID) -> Booking:
    """No ownership check — for front-desk/staff contexts where the acting user isn't
    the booking's own traveler."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id).options(*_EAGER).execution_options(populate_existing=True)
    )
    booking = result.scalar_one_or_none()
    if booking is None:
        raise NotFoundError("Booking not found")
    return booking


async def _assert_booking_belongs_to_property(db: AsyncSession, booking_id: uuid.UUID, property_id: uuid.UUID) -> None:
    result = await db.execute(
        select(BookingItem.id)
        .join(RoomType, RoomType.id == BookingItem.room_type_id)
        .where(BookingItem.booking_id == booking_id, RoomType.property_id == property_id)
    )
    if result.first() is None:
        raise NotFoundError("Booking not found for this property")


async def list_property_bookings(db: AsyncSession, property_id: uuid.UUID) -> list[Booking]:
    """Every booking with a room_type item on this property — for front-desk staff."""
    result = await db.execute(
        select(Booking)
        .join(BookingItem, BookingItem.booking_id == Booking.id)
        .join(RoomType, RoomType.id == BookingItem.room_type_id)
        .where(RoomType.property_id == property_id)
        .options(*_EAGER)
        .order_by(Booking.created_at.desc())
        .distinct()
    )
    return list(result.scalars().all())


async def staff_check_in(db: AsyncSession, property_id: uuid.UUID, booking_id: uuid.UUID) -> Booking:
    await _assert_booking_belongs_to_property(db, booking_id, property_id)
    booking = await get_booking_or_404(db, booking_id)
    await _mark_checked_in(db, booking)
    await db.commit()
    return await get_booking_or_404(db, booking_id)


async def staff_check_out(db: AsyncSession, property_id: uuid.UUID, booking_id: uuid.UUID) -> Booking:
    await _assert_booking_belongs_to_property(db, booking_id, property_id)
    booking = await get_booking_or_404(db, booking_id)
    await _mark_checked_out(db, booking)
    await db.commit()
    return await get_booking_or_404(db, booking_id)


async def assign_room(db: AsyncSession, property_id: uuid.UUID, booking_item_id: uuid.UUID, room_id: uuid.UUID) -> BookingItem:
    result = await db.execute(select(BookingItem).where(BookingItem.id == booking_item_id))
    item = result.scalar_one_or_none()
    if item is None or item.item_type != BookingItemType.ROOM_TYPE:
        raise NotFoundError("Room booking item not found")

    room_result = await db.execute(
        select(Room)
        .join(RoomType, Room.room_type_id == RoomType.id)
        .where(Room.id == room_id, RoomType.property_id == property_id)
    )
    room = room_result.scalar_one_or_none()
    if room is None:
        raise NotFoundError("Room not found on this property")
    if room.room_type_id != item.room_type_id:
        raise ConflictError("This room belongs to a different room type than the booking")

    item.assigned_room_id = room.id
    await db.commit()
    await db.refresh(item)
    return item


async def create_front_desk_booking(db: AsyncSession, property_id: uuid.UUID, payload: FrontDeskBookingCreate) -> Booking:
    """Walk-in booking created by front-desk staff — paid in person, so it skips the
    online-payment step entirely and starts CONFIRMED rather than PENDING_PAYMENT.
    Commission still applies normally at checkout, same as any other room booking."""
    if not payload.items:
        raise ConflictError("A booking needs at least one item")

    user_result = await db.execute(select(User).where(User.email == payload.guest_email))
    user = user_result.scalar_one_or_none()
    if user is None:
        user = User(
            email=payload.guest_email,
            password_hash=hash_password(uuid.uuid4().hex),
            full_name=payload.guest_name,
            system_role=SystemRole.TRAVELER,
        )
        db.add(user)
        await db.flush()

    total = Decimal("0")
    tax_service_total = Decimal("0")
    prepared: list[tuple[BookingItemCreate, Reserved]] = []
    for item in payload.items:
        if item.item_type != BookingItemType.ROOM_TYPE:
            raise ConflictError("Front-desk bookings can only include room_type items")
        room_check = await db.execute(
            select(RoomType.id).where(RoomType.id == item.room_type_id, RoomType.property_id == property_id)
        )
        if room_check.scalar_one_or_none() is None:
            raise NotFoundError("Room type not found on this property")
        reserved = await _reserve_room(db, item)
        tax_service = await _room_tax_and_service_charge(db, item.room_type_id, reserved.subtotal)
        prepared.append((item, reserved))
        total += reserved.subtotal + tax_service
        tax_service_total += tax_service

    # A walk-in found the property themselves — organic by definition.
    booking = Booking(
        user_id=user.id, status=BookingStatus.CONFIRMED, total_amount=total, tax_service_amount=tax_service_total,
        acquisition_channel=AcquisitionChannel.ORGANIC,
    )
    db.add(booking)
    await db.flush()

    for item, reserved in prepared:
        db.add(
            BookingItem(
                booking_id=booking.id,
                item_type=item.item_type,
                room_type_id=item.room_type_id,
                check_in_date=item.check_in_date,
                check_out_date=item.check_out_date,
                quantity=item.quantity,
                unit_price=reserved.unit_price,
                subtotal=reserved.subtotal,
                sold_by_role_id=reserved.owner_role_id,
            )
        )
    db.add(
        BookingStatusHistory(
            booking_id=booking.id,
            to_status=BookingStatus.CONFIRMED.value,
            note="Front-desk walk-in booking — paid in person",
        )
    )
    await db.commit()
    return await get_booking_or_404(db, booking.id)
