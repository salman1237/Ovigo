"""Sprint 25-26 ("Personalization" in the technical document's phase plan): two
independent, deterministic recommendation strategies surfaced on every listing's
detail page. No ML model and no click/impression telemetry exist yet — matching the
"starting judgment call, not tuned against real usage data" precedent core/ranking.py
already sets for search ranking.

**Content-based "similar listings"** (`similar_tours`/`similar_properties`/
`similar_vehicles`) lives in each module's own service.py, next to that module's
existing rating/conversion/ranking helpers, so it can reuse each module's `_EAGER`
loading and PUBLISHED-status filtering exactly like `rank_properties`/`rank_vehicles`
already do. It scores same-location PUBLISHED listings by price closeness to the
source listing (and, for properties/vehicles, a same-category bonus) — tours have no
category field, so that factor is simply dropped there.

**Collaborative "frequently booked together"** (this module) is genuine co-occurrence:
which OTHER tours/properties/vehicles have actually shipped in the same `Booking` as
this one, counted from real `BookingItem` rows sharing a `booking_id`. Restricted to
`BookingItemStatus.COMPLETED` — the same trust bar `core/ranking.py`'s own conversion
signal already uses — so a still-pending or since-cancelled booking never inflates a
pairing. This lives centrally, not per-module, because resolving co-occurring items
back to their owning Tour/Property/Vehicle needs all three modules' models in one
query set; putting it inside any single one of tours/stays/rentcar's service.py would
create a circular import between the other two.
"""
import uuid
from decimal import Decimal

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.modules.bookings.models import BookingItem, BookingItemStatus, BookingItemType
from app.modules.rentcar.models import Vehicle
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture

FREQUENTLY_BOOKED_LIMIT = 6

# (item_type, entity_id, title, price, slug, co_occurrence_count)
_CountRow = tuple[str, uuid.UUID, str, Decimal, str | None, int]


class RecommendedItem(BaseModel):
    item_type: str  # "tour" | "property" | "vehicle"
    id: uuid.UUID
    title: str
    price: Decimal
    slug: str | None = None


async def _completed_booking_ids(
    db: AsyncSession, item_type: BookingItemType, condition: ColumnElement[bool]
) -> list[uuid.UUID]:
    result = await db.execute(
        select(BookingItem.booking_id)
        .where(BookingItem.item_type == item_type, condition, BookingItem.status == BookingItemStatus.COMPLETED)
        .distinct()
    )
    return list(result.scalars().all())


async def _co_occurring_counts(db: AsyncSession, booking_ids: list[uuid.UUID]) -> list[_CountRow]:
    """Every OTHER completed item that shares one of `booking_ids`, resolved back to
    its owning Tour/Property/Vehicle and counted. One query per target type since each
    resolves through a different join chain (TourDeparture->Tour, RoomType->Property,
    Vehicle directly) — a single UNION query would need to fake a common shape across
    all three anyway."""
    if not booking_ids:
        return []

    rows: list[_CountRow] = []

    tour_rows = await db.execute(
        select(Tour.id, Tour.title, Tour.base_price, Tour.slug, func.count(BookingItem.id))
        .select_from(BookingItem)
        .join(TourDeparture, TourDeparture.id == BookingItem.tour_departure_id)
        .join(Tour, Tour.id == TourDeparture.tour_id)
        .where(
            BookingItem.booking_id.in_(booking_ids),
            BookingItem.item_type == BookingItemType.TOUR_DEPARTURE,
            BookingItem.status == BookingItemStatus.COMPLETED,
        )
        .group_by(Tour.id, Tour.title, Tour.base_price, Tour.slug)
    )
    rows += [("tour", tid, title, price, slug, count) for tid, title, price, slug, count in tour_rows.all()]

    property_rows = await db.execute(
        select(Property.id, Property.name, Property.slug, func.min(RoomType.base_price), func.count(BookingItem.id))
        .select_from(BookingItem)
        .join(RoomType, RoomType.id == BookingItem.room_type_id)
        .join(Property, Property.id == RoomType.property_id)
        .where(
            BookingItem.booking_id.in_(booking_ids),
            BookingItem.item_type == BookingItemType.ROOM_TYPE,
            BookingItem.status == BookingItemStatus.COMPLETED,
        )
        .group_by(Property.id, Property.name, Property.slug)
    )
    rows += [("property", pid, name, price, slug, count) for pid, name, slug, price, count in property_rows.all()]

    vehicle_rows = await db.execute(
        select(Vehicle.id, Vehicle.make, Vehicle.model, Vehicle.price_per_day, func.count(BookingItem.id))
        .select_from(BookingItem)
        .join(Vehicle, Vehicle.id == BookingItem.vehicle_id)
        .where(
            BookingItem.booking_id.in_(booking_ids),
            BookingItem.item_type == BookingItemType.VEHICLE_RENTAL,
            BookingItem.status == BookingItemStatus.COMPLETED,
        )
        .group_by(Vehicle.id, Vehicle.make, Vehicle.model, Vehicle.price_per_day)
    )
    rows += [
        ("vehicle", vid, f"{make} {model}", price, None, count) for vid, make, model, price, count in vehicle_rows.all()
    ]

    return rows


def _to_recommended_items(
    counted: list[_CountRow], exclude: tuple[str, uuid.UUID], limit: int
) -> list[RecommendedItem]:
    filtered = [row for row in counted if (row[0], row[1]) != exclude]
    filtered.sort(key=lambda row: row[5], reverse=True)
    return [
        RecommendedItem(item_type=item_type, id=entity_id, title=title, price=price, slug=slug)
        for item_type, entity_id, title, price, slug, _count in filtered[:limit]
    ]


async def frequently_booked_with_tour(
    db: AsyncSession, tour: Tour, limit: int = FREQUENTLY_BOOKED_LIMIT
) -> list[RecommendedItem]:
    """`tour.departures` must already be eager-loaded (true of anything returned by
    tours/service.py's `_EAGER`-loading getters) — BookingItem links to a specific
    TourDeparture, not the Tour directly."""
    departure_ids = [d.id for d in tour.departures]
    if not departure_ids:
        return []
    booking_ids = await _completed_booking_ids(
        db, BookingItemType.TOUR_DEPARTURE, BookingItem.tour_departure_id.in_(departure_ids)
    )
    counted = await _co_occurring_counts(db, booking_ids)
    return _to_recommended_items(counted, ("tour", tour.id), limit)


async def frequently_booked_with_property(
    db: AsyncSession, prop: Property, limit: int = FREQUENTLY_BOOKED_LIMIT
) -> list[RecommendedItem]:
    """`prop.room_types` must already be eager-loaded (true of anything returned by
    stays/service.py's `_EAGER`-loading getters)."""
    room_type_ids = [rt.id for rt in prop.room_types]
    if not room_type_ids:
        return []
    booking_ids = await _completed_booking_ids(
        db, BookingItemType.ROOM_TYPE, BookingItem.room_type_id.in_(room_type_ids)
    )
    counted = await _co_occurring_counts(db, booking_ids)
    return _to_recommended_items(counted, ("property", prop.id), limit)


async def frequently_booked_with_vehicle(
    db: AsyncSession, vehicle: Vehicle, limit: int = FREQUENTLY_BOOKED_LIMIT
) -> list[RecommendedItem]:
    booking_ids = await _completed_booking_ids(
        db, BookingItemType.VEHICLE_RENTAL, BookingItem.vehicle_id == vehicle.id
    )
    counted = await _co_occurring_counts(db, booking_ids)
    return _to_recommended_items(counted, ("vehicle", vehicle.id), limit)
