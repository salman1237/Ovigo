import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.core.slugs import slugify, unique_suffix
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.tours.models import (
    Tour,
    TourActivity,
    TourAddon,
    TourDeparture,
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
)


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


async def list_published_tours(db: AsyncSession, location_ids: list[uuid.UUID] | None = None) -> list[Tour]:
    query = select(Tour).where(Tour.status == TourStatus.PUBLISHED)
    if location_ids is not None:
        from app.modules.locations.models import LocationTag

        query = query.join(
            LocationTag,
            (LocationTag.entity_id == Tour.id) & (LocationTag.entity_type == TaggableEntityType.TOUR),
        ).where(LocationTag.location_id.in_(location_ids))
    result = await db.execute(query.order_by(Tour.created_at.desc()).distinct())
    return list(result.scalars().all())


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
