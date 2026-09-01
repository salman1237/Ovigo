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
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.schemas import AnalyticsDashboard, AnalyticsSummary, TimeseriesPoint, TopListingRead
from app.modules.bookings.models import BookingItem, BookingItemStatus
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
