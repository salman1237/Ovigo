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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings.models import (
    Booking,
    BookingGuest,
    BookingItem,
    BookingItemStatus,
    BookingItemType,
    BookingStatus,
    BookingStatusHistory,
)
from app.modules.bookings.schemas import BookingCreate, BookingItemCreate
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.rentcar.models import Vehicle, VehicleAvailability, VehicleStatus
from app.modules.stays import service as stays_service
from app.modules.stays.models import AvailabilityCalendar, Property, PropertyStatus, RoomType
from app.modules.tours.models import Tour, TourDeparture, TourStatus
from app.modules.users.models import User

_EAGER = (
    selectinload(Booking.items),
    selectinload(Booking.guests),
)


async def _reserve_tour_departure(db: AsyncSession, item: BookingItemCreate) -> tuple[Decimal, Decimal]:
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
    return unit_price, unit_price * item.quantity


async def _release_tour_departure(db: AsyncSession, departure_id: uuid.UUID, quantity: int) -> None:
    result = await db.execute(select(TourDeparture).where(TourDeparture.id == departure_id).with_for_update())
    departure = result.scalar_one_or_none()
    if departure is not None:
        departure.available_seats += quantity


def _date_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days)]


async def _reserve_room(db: AsyncSession, item: BookingItemCreate) -> tuple[Decimal, Decimal]:
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

    return room.base_price, subtotal


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


async def _reserve_vehicle(db: AsyncSession, item: BookingItemCreate) -> tuple[Decimal, Decimal]:
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
    return vehicle.price_per_day, subtotal


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
    prepared: list[tuple[BookingItemCreate, Decimal, Decimal]] = []
    for item in payload.items:
        tax_service = Decimal("0")
        if item.item_type == BookingItemType.TOUR_DEPARTURE:
            unit_price, subtotal = await _reserve_tour_departure(db, item)
        elif item.item_type == BookingItemType.ROOM_TYPE:
            unit_price, subtotal = await _reserve_room(db, item)
            tax_service = await _room_tax_and_service_charge(db, item.room_type_id, subtotal)
        elif item.item_type == BookingItemType.VEHICLE_RENTAL:
            unit_price, subtotal = await _reserve_vehicle(db, item)
        else:
            # CUSTOM_BID is rejected by BookingItemCreate's own validator before
            # reaching here — this branch exists only so a future new item type
            # fails loudly instead of silently mis-dispatching.
            raise ConflictError(f"Cannot create a booking item of type {item.item_type.value} directly")
        prepared.append((item, unit_price, subtotal))
        total += subtotal + tax_service
        tax_service_total += tax_service

    booking = Booking(user_id=user.id, total_amount=total, tax_service_amount=tax_service_total)
    db.add(booking)
    await db.flush()

    for item, unit_price, subtotal in prepared:
        db.add(
            BookingItem(
                booking_id=booking.id,
                item_type=item.item_type,
                tour_departure_id=item.tour_departure_id,
                room_type_id=item.room_type_id,
                vehicle_id=item.vehicle_id,
                check_in_date=item.check_in_date,
                check_out_date=item.check_out_date,
                quantity=item.quantity,
                unit_price=unit_price,
                subtotal=subtotal,
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
    booking = Booking(user_id=user.id, total_amount=price)
    db.add(booking)
    await db.flush()

    db.add(
        BookingItem(
            booking_id=booking.id,
            item_type=BookingItemType.CUSTOM_BID,
            custom_bid_id=bid_id,
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
        item.status = BookingItemStatus.CANCELLED

    await _add_status_history(db, booking, BookingStatus.CANCELLED, note=note)
    booking.status = BookingStatus.CANCELLED
    await notifications_service.notify(
        db,
        user_id=booking.user_id,
        type=NotificationType.BOOKING_CANCELLED,
        title="Booking cancelled",
        message=note or "Your booking has been cancelled.",
        link=f"/bookings/{booking.id}",
    )


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


async def check_in(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    booking = await get_own_booking_or_404(db, user, booking_id)
    if booking.status != BookingStatus.CONFIRMED:
        raise ConflictError(f"Booking must be confirmed to check in (currently {booking.status.value})")
    for item in booking.items:
        item.status = BookingItemStatus.CHECKED_IN
    await _add_status_history(db, booking, BookingStatus.CHECKED_IN)
    booking.status = BookingStatus.CHECKED_IN
    await db.commit()
    return await get_own_booking_or_404(db, user, booking_id)


async def check_out(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    from app.modules.commissions import service as commissions_service  # avoid import cycle at module load

    booking = await get_own_booking_or_404(db, user, booking_id)
    if booking.status != BookingStatus.CHECKED_IN:
        raise ConflictError(f"Booking must be checked in before checking out (currently {booking.status.value})")
    for item in booking.items:
        item.status = BookingItemStatus.COMPLETED
    await _add_status_history(db, booking, BookingStatus.CHECKED_OUT)
    await _add_status_history(db, booking, BookingStatus.COMPLETED, note="Auto-completed on checkout")
    booking.status = BookingStatus.COMPLETED
    await commissions_service.mark_payable_for_booking(db, booking)
    await notifications_service.notify(
        db,
        user_id=booking.user_id,
        type=NotificationType.BOOKING_COMPLETED,
        title="Booking completed",
        message="Your booking is complete. We'd love to hear about your experience — leave a review!",
        link=f"/bookings/{booking.id}",
    )
    await db.commit()
    return await get_own_booking_or_404(db, user, booking_id)
