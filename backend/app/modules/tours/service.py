import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import storage
from app.core.exceptions import ConflictError, NotFoundError
from app.core.ranking import RankingFactors, composite_score, relevance_for
from app.core.slugs import slugify, unique_suffix
from app.modules.bookings.models import BookingItem, BookingItemStatus
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.reviews.models import Review
from app.modules.tours.models import (
    Tour,
    TourActivity,
    TourAddon,
    TourDeparture,
    TourImage,
    TourItineraryDay,
    TourMeal,
    TourStatus,
    TourStay,
    TourTransport,
)
from app.modules.tours.schemas import (
    ActivityCreate,
    AddonCreate,
    DepartureCreate,
    ItineraryDayCreate,
    MealCreate,
    TourCreate,
    TourStayCreate,
    TourUpdate,
    TransportCreate,
)
from app.modules.users.models import PartnerRole

_EAGER = (
    selectinload(Tour.itinerary),
    selectinload(Tour.departures),
    selectinload(Tour.meals),
    selectinload(Tour.activities),
    selectinload(Tour.addons),
    selectinload(Tour.transport),
    selectinload(Tour.stays),
    selectinload(Tour.images),
)

MAX_IMAGES_PER_TOUR = 10


async def _unique_slug(db: AsyncSession, title: str) -> str:
    base = slugify(title)
    slug = base
    while (await db.execute(select(Tour.id).where(Tour.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{unique_suffix()}"
    return slug


async def create_tour(db: AsyncSession, role: PartnerRole, payload: TourCreate) -> Tour:
    slug = await _unique_slug(db, payload.title)
    tour = Tour(local_expert_role_id=role.id, slug=slug, **payload.model_dump())
    db.add(tour)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour.id)


async def get_own_tour_or_404(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> Tour:
    # populate_existing=True: several service functions fetch, mutate a child collection,
    # commit, then re-fetch this same tour in the same session to build the response. Without
    # it, SQLAlchemy's identity map would hand back the first fetch's already-loaded (now
    # stale) collections instead of re-querying them, and the response would silently omit
    # whatever was just added.
    result = await db.execute(
        select(Tour)
        .where(Tour.id == tour_id, Tour.local_expert_role_id == role.id)
        .options(*_EAGER)
        .execution_options(populate_existing=True)
    )
    tour = result.scalar_one_or_none()
    if tour is None:
        raise NotFoundError("Tour not found")
    return tour


async def get_tour_for_view(db: AsyncSession, tour_id: uuid.UUID, viewer_role: PartnerRole | None) -> Tour:
    """Published tours are visible to anyone; drafts/pending/rejected only to the owner."""
    result = await db.execute(
        select(Tour).where(Tour.id == tour_id).options(*_EAGER).execution_options(populate_existing=True)
    )
    tour = result.scalar_one_or_none()
    if tour is None:
        raise NotFoundError("Tour not found")
    if tour.status != TourStatus.PUBLISHED:
        if viewer_role is None or tour.local_expert_role_id != viewer_role.id:
            raise NotFoundError("Tour not found")
    return tour


async def list_my_tours(db: AsyncSession, role: PartnerRole) -> list[Tour]:
    result = await db.execute(
        select(Tour).where(Tour.local_expert_role_id == role.id).options(*_EAGER).order_by(Tour.created_at.desc())
    )
    return list(result.scalars().all())


async def _tour_rating_map(db: AsyncSession, tour_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    if not tour_ids:
        return {}
    result = await db.execute(
        select(Review.tour_id, func.avg(Review.rating)).where(Review.tour_id.in_(tour_ids)).group_by(Review.tour_id)
    )
    return dict(result.all())


async def _tour_conversion_map(db: AsyncSession, tour_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not tour_ids:
        return {}
    result = await db.execute(
        select(Tour.id, func.count(BookingItem.id))
        .select_from(Tour)
        .join(TourDeparture, TourDeparture.tour_id == Tour.id)
        .join(BookingItem, BookingItem.tour_departure_id == TourDeparture.id)
        .where(Tour.id.in_(tour_ids), BookingItem.status == BookingItemStatus.COMPLETED)
        .group_by(Tour.id)
    )
    return dict(result.all())


async def list_published_tours(db: AsyncSession, location_ids: list[uuid.UUID] | None = None) -> list[Tour]:
    """Ranked by core/ranking.py's composite score (relevance/rating/conversion/
    completeness) — see that module's docstring for the formula and what each factor
    means here. `created_at desc` is only the final tiebreaker now, not the primary
    order."""
    from app.modules.locations.models import LocationTag

    query = (
        select(Tour)
        .where(Tour.status == TourStatus.PUBLISHED)
        .options(selectinload(Tour.itinerary), selectinload(Tour.departures))
    )
    if location_ids is not None:
        query = query.join(
            LocationTag,
            (LocationTag.entity_id == Tour.id) & (LocationTag.entity_type == TaggableEntityType.TOUR),
        ).where(LocationTag.location_id.in_(location_ids))
    result = await db.execute(query.distinct())
    tours = list(result.scalars().all())
    if not tours:
        return tours

    tour_ids = [t.id for t in tours]
    ratings = await _tour_rating_map(db, tour_ids)
    conversions = await _tour_conversion_map(db, tour_ids)
    exact_match_ids = (
        await locations_service.get_exact_match_ids(db, TaggableEntityType.TOUR, tour_ids, location_ids[0])
        if location_ids
        else set()
    )
    today = date.today()

    def score(tour: Tour) -> float:
        completeness_signals = [
            bool(tour.description),
            bool(tour.itinerary),
            any(dep.departure_date >= today for dep in tour.departures),
        ]
        factors = RankingFactors(
            relevance=relevance_for(tour.id, location_ids, exact_match_ids),
            rating=ratings.get(tour.id),
            conversion_count=conversions.get(tour.id, 0),
            completeness=sum(completeness_signals) / len(completeness_signals),
        )
        return composite_score(factors)

    tours.sort(key=lambda t: (score(t), t.created_at), reverse=True)
    return tours


SIMILAR_TOURS_LIMIT = 6


async def similar_tours(db: AsyncSession, tour: Tour, limit: int = SIMILAR_TOURS_LIMIT) -> list[Tour]:
    """Content-based "similar tours" (Sprint 25-26 personalization): other PUBLISHED
    tours sharing at least one of `tour`'s own location tags, ranked by price
    closeness to `tour.base_price` — see core/recommendations.py's module docstring
    for why this scoring lives per-module rather than centrally. Tours have no
    category field, so price is the only similarity signal here (properties/vehicles
    add a same-category bonus)."""
    from app.modules.locations.models import LocationTag

    own_tags = await locations_service.get_tags(db, TaggableEntityType.TOUR, tour.id)
    location_ids = [t.location_id for t in own_tags]
    if not location_ids:
        return []

    result = await db.execute(
        select(Tour)
        .join(LocationTag, (LocationTag.entity_id == Tour.id) & (LocationTag.entity_type == TaggableEntityType.TOUR))
        .where(Tour.status == TourStatus.PUBLISHED, Tour.id != tour.id, LocationTag.location_id.in_(location_ids))
        .options(*_EAGER)
        .distinct()
    )
    candidates = list(result.scalars().all())
    if not candidates:
        return []

    def price_closeness(candidate: Tour) -> float:
        if tour.base_price == 0:
            return 0.5
        relative_gap = abs(float(candidate.base_price - tour.base_price)) / float(tour.base_price)
        return max(0.0, 1.0 - relative_gap)

    candidates.sort(key=price_closeness, reverse=True)
    return candidates[:limit]


async def update_tour(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: TourUpdate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tour, field, value)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def delete_tour(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> None:
    tour = await get_own_tour_or_404(db, role, tour_id)
    if tour.status != TourStatus.DRAFT:
        raise ConflictError("Only draft tours can be deleted — reject or unpublish first")
    await db.delete(tour)
    await db.commit()


def _require_editable(tour: Tour) -> None:
    if tour.status == TourStatus.PENDING_REVIEW:
        raise ConflictError("Tour is pending review — cannot be edited until it's approved or rejected")


async def add_itinerary_day(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: ItineraryDayCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourItineraryDay(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_departure(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: DepartureCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourDeparture(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_meal(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: MealCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourMeal(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_activity(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: ActivityCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourActivity(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_addon(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: AddonCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourAddon(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_transport(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: TransportCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourTransport(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_stay(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: TourStayCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourStay(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_image(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, file_name: str, content_type: str, data: bytes
) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    if len(tour.images) >= MAX_IMAGES_PER_TOUR:
        raise ConflictError(f"A tour can have at most {MAX_IMAGES_PER_TOUR} images")
    storage.validate_image(content_type, len(data))

    key = storage.build_key(f"tours/{tour.id}", file_name)
    storage.upload_bytes(key, data, content_type)
    db.add(
        TourImage(
            tour_id=tour.id,
            storage_key=key,
            content_type=content_type,
            file_name=file_name,
            sort_order=len(tour.images),
        )
    )
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def delete_image(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, image_id: uuid.UUID) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    result = await db.execute(select(TourImage).where(TourImage.id == image_id, TourImage.tour_id == tour.id))
    image = result.scalar_one_or_none()
    if image is None:
        raise NotFoundError("Image not found")
    storage.delete_object(image.storage_key)
    await db.delete(image)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def get_image_or_404(db: AsyncSession, tour_id: uuid.UUID, image_id: uuid.UUID) -> TourImage:
    result = await db.execute(select(TourImage).where(TourImage.id == image_id, TourImage.tour_id == tour_id))
    image = result.scalar_one_or_none()
    if image is None:
        raise NotFoundError("Image not found")
    return image


_CHILD_MODELS = {
    "itinerary": TourItineraryDay,
    "departures": TourDeparture,
    "meals": TourMeal,
    "activities": TourActivity,
    "addons": TourAddon,
    "transport": TourTransport,
    "stays": TourStay,
}


async def delete_child(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, child_type: str, child_id: uuid.UUID
) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    model = _CHILD_MODELS[child_type]
    result = await db.execute(select(model).where(model.id == child_id, model.tour_id == tour.id))
    item = result.scalar_one_or_none()
    if item is None:
        raise NotFoundError("Item not found")
    await db.delete(item)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def submit_for_review(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    if tour.status not in (TourStatus.DRAFT, TourStatus.REJECTED):
        raise ConflictError(f"Tour is {tour.status.value} — cannot be resubmitted")
    if not tour.itinerary:
        raise ConflictError("Add at least one itinerary day before submitting")
    if not tour.departures:
        raise ConflictError("Add at least one departure date before submitting")
    if not await locations_service.has_tags(db, TaggableEntityType.TOUR, tour.id):
        raise ConflictError("Tag at least one destination before submitting")

    tour.status = TourStatus.PENDING_REVIEW
    tour.rejection_reason = None
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)
