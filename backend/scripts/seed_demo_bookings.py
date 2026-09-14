"""One-off: create a few sample bookings (and reviews on the completed ones) so
the bookings/payments/commissions/reviews modules have real content to browse,
alongside the catalog data from seed_demo_data.py.

Uses the real service-layer functions throughout (create_booking, the bank
transfer payment flow, check_in/check_out, create_review) rather than raw
inserts — so escrow, commissions, loyalty points, and notifications all fire
exactly as they would for a real booking. Bank transfer is used instead of
SSLCommerz specifically because it never calls out to a real payment gateway.

    python scripts/seed_demo_bookings.py
"""
import asyncio
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.bookings import service as bookings_service  # noqa: E402
from app.modules.bookings.models import Booking  # noqa: E402
from app.modules.bookings.schemas import BookingCreate, BookingItemCreate, GuestCreate  # noqa: E402
from app.modules.bookings.models import BookingItemType, BookingItem  # noqa: E402
from app.modules.payments import service as payments_service  # noqa: E402
from app.modules.reviews import service as reviews_service  # noqa: E402
from app.modules.reviews.schemas import ReviewCreate  # noqa: E402
from app.modules.rentcar.models import Vehicle, VehicleAvailability  # noqa: E402
from app.modules.stays.models import AvailabilityCalendar, Property, RoomType  # noqa: E402
from app.modules.tours.models import Tour, TourDeparture  # noqa: E402
from app.modules.users.models import User  # noqa: E402

AVAILABILITY_WINDOW_DAYS = 60


async def open_all_availability(db) -> None:
    """Room/vehicle bookings require an existing AvailabilityCalendar /
    VehicleAvailability row for every date in range (see bookings/service.py's
    _reserve_room / _reserve_vehicle) — the catalog seed never created these.
    Opens the next 60 days for every seeded room type and vehicle so they're
    actually bookable, not just browsable. Skips dates that already have a row
    (idempotent, and doesn't clobber any pre-existing real availability)."""
    today = date.today()
    all_dates = [today + timedelta(days=i) for i in range(AVAILABILITY_WINDOW_DAYS)]

    room_types = (await db.execute(select(RoomType))).scalars().all()
    for rt in room_types:
        existing = (
            (await db.execute(select(AvailabilityCalendar.date).where(AvailabilityCalendar.room_type_id == rt.id)))
            .scalars()
            .all()
        )
        existing_dates = set(existing)
        for d in all_dates:
            if d not in existing_dates:
                db.add(AvailabilityCalendar(room_type_id=rt.id, date=d, available_units=rt.total_units))

    vehicles = (await db.execute(select(Vehicle))).scalars().all()
    for v in vehicles:
        existing = (
            (await db.execute(select(VehicleAvailability.date).where(VehicleAvailability.vehicle_id == v.id)))
            .scalars()
            .all()
        )
        existing_dates = set(existing)
        for d in all_dates:
            if d not in existing_dates:
                db.add(VehicleAvailability(vehicle_id=v.id, date=d, is_available=True))

    await db.commit()
    print(f"Opened {AVAILABILITY_WINDOW_DAYS} days of availability for {len(room_types)} room types and {len(vehicles)} vehicles")


async def get_user(db, email: str) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise RuntimeError(f"User not found: {email} — run seed_demo_data.py first")
    return user


async def complete_via_bank_transfer(db, user: User, admin: User, booking: Booking) -> Booking:
    payment = await payments_service.initiate_bank_transfer(db, user, booking.id)
    await payments_service.submit_bank_reference(db, user, payment.id, f"SEED-{uuid.uuid4().hex[:10].upper()}")
    await payments_service.verify_bank_transfer(db, admin, payment.id)
    await db.commit()
    return await bookings_service.get_own_booking_or_404(db, user, booking.id)


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await open_all_availability(db)

        traveler = await get_user(db, "demo-traveler@ovigo-demo.com")
        traveler2 = await get_user(db, "demo-traveler2@ovigo-demo.com")
        admin = await get_user(db, "demo-admin@ovigo-demo.com")

        # --- Booking 1: a completed tour booking with a 5-star review ---
        result = await db.execute(
            select(TourDeparture)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(Tour.title == "Cox's Bazar Beach Escape")
            .order_by(TourDeparture.departure_date)
            .limit(1)
        )
        departure = result.scalar_one()
        booking = await bookings_service.create_booking(
            db,
            traveler,
            BookingCreate(
                items=[BookingItemCreate(item_type=BookingItemType.TOUR_DEPARTURE, tour_departure_id=departure.id, quantity=2)],
                guests=[GuestCreate(full_name="Demo Traveler"), GuestCreate(full_name="Guest Two")],
            ),
        )
        booking = await complete_via_bank_transfer(db, traveler, admin, booking)
        booking = await bookings_service.check_in(db, traveler, booking.id)
        booking = await bookings_service.check_out(db, traveler, booking.id)
        item_id = booking.items[0].id
        await reviews_service.create_review(
            db, traveler, ReviewCreate(booking_item_id=item_id, rating=5, comment="Absolutely loved the beach and the sunset views. Our guide was fantastic!")
        )
        await db.commit()
        print("Booking 1: Cox's Bazar Beach Escape — COMPLETED + reviewed (5*)")

        # --- Booking 2: a completed Sundarbans tour with a 4-star review, different traveler ---
        result = await db.execute(
            select(TourDeparture)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(Tour.title == "Sundarbans Mangrove Safari")
            .order_by(TourDeparture.departure_date)
            .limit(1)
        )
        departure2 = result.scalar_one()
        booking2 = await bookings_service.create_booking(
            db,
            traveler2,
            BookingCreate(
                items=[BookingItemCreate(item_type=BookingItemType.TOUR_DEPARTURE, tour_departure_id=departure2.id, quantity=1)],
                guests=[GuestCreate(full_name="Demo Traveler Two")],
            ),
        )
        booking2 = await complete_via_bank_transfer(db, traveler2, admin, booking2)
        booking2 = await bookings_service.check_in(db, traveler2, booking2.id)
        booking2 = await bookings_service.check_out(db, traveler2, booking2.id)
        item2_id = booking2.items[0].id
        await reviews_service.create_review(
            db, traveler2, ReviewCreate(booking_item_id=item2_id, rating=4, comment="Great wildlife spotting, though the boat was a bit crowded.")
        )
        await db.commit()
        print("Booking 2: Sundarbans Mangrove Safari — COMPLETED + reviewed (4*)")

        # --- Booking 3: a completed stay with a 5-star review ---
        result = await db.execute(
            select(RoomType)
            .join(Property, Property.id == RoomType.property_id)
            .where(Property.name == "Sea Pearl Beach Resort", RoomType.name == "Deluxe Room")
            .limit(1)
        )
        room_type = result.scalar_one()
        check_in_date = date.today() + timedelta(days=20)
        check_out_date = check_in_date + timedelta(days=3)
        booking3 = await bookings_service.create_booking(
            db,
            traveler,
            BookingCreate(
                items=[
                    BookingItemCreate(
                        item_type=BookingItemType.ROOM_TYPE,
                        room_type_id=room_type.id,
                        check_in_date=check_in_date,
                        check_out_date=check_out_date,
                        quantity=1,
                    )
                ],
                guests=[GuestCreate(full_name="Demo Traveler")],
            ),
        )
        booking3 = await complete_via_bank_transfer(db, traveler, admin, booking3)
        booking3 = await bookings_service.check_in(db, traveler, booking3.id)
        booking3 = await bookings_service.check_out(db, traveler, booking3.id)
        item3_id = booking3.items[0].id
        await reviews_service.create_review(
            db, traveler, ReviewCreate(booking_item_id=item3_id, rating=5, comment="The room was spotless and the pool view was worth every taka.")
        )
        await db.commit()
        print("Booking 3: Sea Pearl Beach Resort — COMPLETED + reviewed (5*)")

        # --- Booking 4: a completed vehicle rental with a 4-star review ---
        result = await db.execute(
            select(Vehicle).where(Vehicle.make == "Toyota", Vehicle.model == "Corolla Axio").limit(1)
        )
        vehicle = result.scalar_one()
        v_check_in = date.today() + timedelta(days=10)
        v_check_out = v_check_in + timedelta(days=2)
        booking4 = await bookings_service.create_booking(
            db,
            traveler2,
            BookingCreate(
                items=[
                    BookingItemCreate(
                        item_type=BookingItemType.VEHICLE_RENTAL,
                        vehicle_id=vehicle.id,
                        check_in_date=v_check_in,
                        check_out_date=v_check_out,
                        quantity=1,
                    )
                ],
                guests=[GuestCreate(full_name="Demo Traveler Two")],
            ),
        )
        booking4 = await complete_via_bank_transfer(db, traveler2, admin, booking4)
        booking4 = await bookings_service.check_in(db, traveler2, booking4.id)
        booking4 = await bookings_service.check_out(db, traveler2, booking4.id)
        item4_id = booking4.items[0].id
        await reviews_service.create_review(
            db, traveler2, ReviewCreate(booking_item_id=item4_id, rating=4, comment="Car was clean and well-maintained, pickup was quick.")
        )
        await db.commit()
        print("Booking 4: Dhaka Wheels — Toyota Corolla Axio — COMPLETED + reviewed (4*)")

        # --- Booking 5: a bundled tour+stay booking left CONFIRMED (in progress, not completed) ---
        result = await db.execute(
            select(TourDeparture)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(Tour.title == "Old Dhaka Heritage Walk")
            .order_by(TourDeparture.departure_date)
            .limit(1)
        )
        departure5 = result.scalar_one()
        result = await db.execute(
            select(RoomType)
            .join(Property, Property.id == RoomType.property_id)
            .where(Property.name == "Dhaka Grand Residency")
            .limit(1)
        )
        room_type5 = result.scalar_one()
        d_check_in = date.today() + timedelta(days=14)
        d_check_out = d_check_in + timedelta(days=2)
        booking5 = await bookings_service.create_booking(
            db,
            traveler,
            BookingCreate(
                items=[
                    BookingItemCreate(item_type=BookingItemType.TOUR_DEPARTURE, tour_departure_id=departure5.id, quantity=1),
                    BookingItemCreate(
                        item_type=BookingItemType.ROOM_TYPE,
                        room_type_id=room_type5.id,
                        check_in_date=d_check_in,
                        check_out_date=d_check_out,
                        quantity=1,
                    ),
                ],
                guests=[GuestCreate(full_name="Demo Traveler")],
            ),
        )
        booking5 = await complete_via_bank_transfer(db, traveler, admin, booking5)
        print(f"Booking 5: Dhaka Walk + Grand Suites bundle — left CONFIRMED (bundle discount: {booking5.bundle_discount_amount})")

        # --- Booking 6: left unpaid (PENDING_PAYMENT) so that state is visible too ---
        result = await db.execute(
            select(TourDeparture)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(Tour.title == "Bangkok Temples & Night Markets")
            .order_by(TourDeparture.departure_date)
            .limit(1)
        )
        departure6 = result.scalar_one()
        booking6 = await bookings_service.create_booking(
            db,
            traveler2,
            BookingCreate(
                items=[BookingItemCreate(item_type=BookingItemType.TOUR_DEPARTURE, tour_departure_id=departure6.id, quantity=1)],
                guests=[GuestCreate(full_name="Demo Traveler Two")],
            ),
        )
        print(f"Booking 6: Bangkok Temples & Night Markets — left PENDING_PAYMENT (id {booking6.id})")

        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
