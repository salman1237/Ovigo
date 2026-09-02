"""Advanced partner analytics: booking/revenue trends and top-performing listings,
built entirely by querying existing Commission/BookingItem/Review rows — no new
tables. This is possible without re-deriving the booking-item-to-partner join logic
that commissions/service.py and chat/service.py each need for their own purposes,
because a Commission row already carries `partner_role_id` directly (added in
Sprint 14-15's rules engine) — so summary/timeseries queries filter on that column
alone. Only "top listings" needs the per-item-type joins, since it groups by the
underlying Tour/Property/Vehicle rather than by partner role.

Scope trim: a CUSTOM_BID commission counts toward the summary/timeseries totals
(it's still real revenue) but is left out of "top listings" — a one-off custom
bid isn't a reusable listing to rank the way a Tour/Property/Vehicle is.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.analytics.schemas import (
    AnalyticsDashboard,
    AnalyticsSummary,
    HotelPerformanceReport,
    TimeseriesPoint,
    TopListingRead,
)
from app.modules.bookings.models import BookingItem, BookingItemStatus, BookingItemType
from app.modules.commissions.models import Commission
from app.modules.rentcar.models import Vehicle
from app.modules.reviews.models import Review
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerRole, PartnerRoleType


async def _summary(db: AsyncSession, role: PartnerRole) -> AnalyticsSummary:
    result = await db.execute(
        select(Commission.gross_amount, Commission.partner_net_amount, BookingItem.status, BookingItem.id)
        .join(BookingItem, Commission.booking_item_id == BookingItem.id)
        .where(Commission.partner_role_id == role.id)
    )
    rows = result.all()

    total_bookings = len(rows)
    completed = sum(1 for _, _, status, _ in rows if status == BookingItemStatus.COMPLETED)
    cancelled = sum(1 for _, _, status, _ in rows if status == BookingItemStatus.CANCELLED)
    gross_revenue = sum((r[0] for r in rows), Decimal("0"))
    net_earnings = sum((r[1] for r in rows), Decimal("0"))

    item_ids = [r[3] for r in rows]
    average_rating: float | None = None
    review_count = 0
    if item_ids:
        review_result = await db.execute(
            select(func.avg(Review.rating), func.count(Review.id)).where(Review.booking_item_id.in_(item_ids))
        )
        avg, count = review_result.first()
        average_rating = float(avg) if avg is not None else None
        review_count = count or 0

    return AnalyticsSummary(
        total_bookings=total_bookings,
        completed_bookings=completed,
        cancelled_bookings=cancelled,
        gross_revenue=gross_revenue,
        net_earnings=net_earnings,
        average_rating=average_rating,
        review_count=review_count,
    )


async def _timeseries(db: AsyncSession, role: PartnerRole, months: int = 6) -> list[TimeseriesPoint]:
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    period = func.to_char(Commission.created_at, "YYYY-MM")
    result = await db.execute(
        select(
            period.label("period"),
            func.count(Commission.id),
            func.sum(Commission.gross_amount),
            func.sum(Commission.partner_net_amount),
        )
        .where(Commission.partner_role_id == role.id, Commission.created_at >= since)
        .group_by(period)
        .order_by(period)
    )
    return [
        TimeseriesPoint(
            period=r[0], bookings_count=r[1], gross_revenue=r[2] or Decimal("0"), net_earnings=r[3] or Decimal("0")
        )
        for r in result.all()
    ]


async def _top_listings(db: AsyncSession, role: PartnerRole, limit: int = 5) -> list[TopListingRead]:
    if role.role_type == PartnerRoleType.LOCAL_EXPERT:
        result = await db.execute(
            select(Tour.id, Tour.title, func.count(Commission.id), func.sum(Commission.gross_amount))
            .join(TourDeparture, TourDeparture.tour_id == Tour.id)
            .join(BookingItem, BookingItem.tour_departure_id == TourDeparture.id)
            .join(Commission, Commission.booking_item_id == BookingItem.id)
            .where(Commission.partner_role_id == role.id)
            .group_by(Tour.id, Tour.title)
            .order_by(func.sum(Commission.gross_amount).desc())
            .limit(limit)
        )
        return [TopListingRead(id=r[0], title=r[1], bookings_count=r[2], gross_revenue=r[3]) for r in result.all()]

    if role.role_type in (PartnerRoleType.HOST, PartnerRoleType.HOTEL):
        result = await db.execute(
            select(Property.id, Property.name, func.count(Commission.id), func.sum(Commission.gross_amount))
            .join(RoomType, RoomType.property_id == Property.id)
            .join(BookingItem, BookingItem.room_type_id == RoomType.id)
            .join(Commission, Commission.booking_item_id == BookingItem.id)
            .where(Commission.partner_role_id == role.id)
            .group_by(Property.id, Property.name)
            .order_by(func.sum(Commission.gross_amount).desc())
            .limit(limit)
        )
        return [TopListingRead(id=r[0], title=r[1], bookings_count=r[2], gross_revenue=r[3]) for r in result.all()]

    if role.role_type == PartnerRoleType.RENT_A_CAR:
        result = await db.execute(
            select(
                Vehicle.id, Vehicle.make, Vehicle.model, func.count(Commission.id), func.sum(Commission.gross_amount)
            )
            .join(BookingItem, BookingItem.vehicle_id == Vehicle.id)
            .join(Commission, Commission.booking_item_id == BookingItem.id)
            .where(Commission.partner_role_id == role.id)
            .group_by(Vehicle.id, Vehicle.make, Vehicle.model)
            .order_by(func.sum(Commission.gross_amount).desc())
            .limit(limit)
        )
        return [
            TopListingRead(id=r[0], title=f"{r[1]} {r[2]}", bookings_count=r[3], gross_revenue=r[4])
            for r in result.all()
        ]

    return []


async def get_dashboard(db: AsyncSession, role: PartnerRole) -> AnalyticsDashboard:
    return AnalyticsDashboard(
        summary=await _summary(db, role),
        timeseries=await _timeseries(db, role),
        top_listings=await _top_listings(db, role),
    )


async def get_hotel_performance(
    db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, start_date: date, end_date: date
) -> HotelPerformanceReport:
    """Occupancy/ADR/RevPAR for one property over [start_date, end_date).

    Scope trim (documented since these are approximations, not a certified ledger):
    `available_room_nights` uses each room type's configured `total_units` × days in
    the period (theoretical capacity) rather than day-by-day AvailabilityCalendar
    overrides — a host who's manually closed out specific dates will see a slightly
    inflated denominator. `booked_room_nights`/`revenue` are bucketed by a booking
    item's check-in date falling in the period (its full stay counted in full), not
    true per-night stay-through accounting — the same "good enough for a reporting
    KPI, not a financial ledger" trade-off already used by this module's monthly
    timeseries (bucketed by Commission.created_at)."""
    prop_result = await db.execute(
        select(Property).where(Property.id == property_id, Property.host_role_id == role.id)
    )
    prop = prop_result.scalar_one_or_none()
    if prop is None:
        raise NotFoundError("Property not found")

    days_in_period = (end_date - start_date).days
    if days_in_period <= 0:
        raise ConflictError("end_date must be after start_date")

    units_result = await db.execute(
        select(func.coalesce(func.sum(RoomType.total_units), 0)).where(RoomType.property_id == property_id)
    )
    total_units = units_result.scalar_one()
    available_room_nights = total_units * days_in_period

    items_result = await db.execute(
        select(BookingItem.check_in_date, BookingItem.check_out_date, BookingItem.quantity, BookingItem.subtotal)
        .join(RoomType, RoomType.id == BookingItem.room_type_id)
        .where(
            RoomType.property_id == property_id,
            BookingItem.item_type == BookingItemType.ROOM_TYPE,
            BookingItem.status != BookingItemStatus.CANCELLED,
            BookingItem.check_in_date >= start_date,
            BookingItem.check_in_date < end_date,
        )
    )
    booked_room_nights = 0
    revenue = Decimal("0")
    for check_in, check_out, quantity, subtotal in items_result.all():
        booked_room_nights += (check_out - check_in).days * quantity
        revenue += subtotal

    occupancy_rate = (booked_room_nights / available_room_nights) if available_room_nights else 0.0
    adr = (revenue / booked_room_nights).quantize(Decimal("0.01")) if booked_room_nights else Decimal("0")
    revpar = (revenue / available_room_nights).quantize(Decimal("0.01")) if available_room_nights else Decimal("0")

    return HotelPerformanceReport(
        property_id=property_id,
        start_date=start_date,
        end_date=end_date,
        available_room_nights=available_room_nights,
        booked_room_nights=booked_room_nights,
        occupancy_rate=round(occupancy_rate, 4),
        revenue=revenue,
        adr=adr,
        revpar=revpar,
    )
