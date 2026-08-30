import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user_optional
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.locations.schemas import LocationTagRead, LocationTagSet
from app.modules.tours import service
from app.modules.tours.schemas import (
    ActivityCreate,
    AddonCreate,
    DepartureCreate,
    ItineraryDayCreate,
    MealCreate,
    TourCreate,
    TourRead,
    TourStayCreate,
    TourSummary,
    TourUpdate,
    TransportCreate,
)
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/tours", tags=["tours"])

require_expert = require_approved_role(PartnerRoleType.LOCAL_EXPERT)


async def _viewer_role(
    current_user: User | None = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)
) -> PartnerRole | None:
    if current_user is None:
        return None
    result = await db.execute(
        select(PartnerRole)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerAccount.user_id == current_user.id, PartnerRole.role_type == PartnerRoleType.LOCAL_EXPERT)
    )
    return result.scalars().first()


@router.post("", response_model=TourRead, status_code=201)
async def create_tour(
    payload: TourCreate, role: PartnerRole = Depends(require_expert), db: AsyncSession = Depends(get_db)
):
    return await service.create_tour(db, role, payload)


@router.get("", response_model=list[TourSummary])
async def list_published_tours(location_slug: str | None = None, db: AsyncSession = Depends(get_db)):
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []  # unknown destination slug — no matches, not "no filter"
        return await service.list_published_tours(db, location_ids)
    return await service.list_published_tours(db, None)


@router.get("/mine", response_model=list[TourRead])
async def list_my_tours(role: PartnerRole = Depends(require_expert), db: AsyncSession = Depends(get_db)):
    return await service.list_my_tours(db, role)


@router.get("/{tour_id}", response_model=TourRead)
async def get_tour(
    tour_id: uuid.UUID, viewer_role: PartnerRole | None = Depends(_viewer_role), db: AsyncSession = Depends(get_db)
):
    return await service.get_tour_for_view(db, tour_id, viewer_role)


@router.put("/{tour_id}", response_model=TourRead)
async def update_tour(
    tour_id: uuid.UUID,
    payload: TourUpdate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_tour(db, role, tour_id, payload)


@router.delete("/{tour_id}", status_code=204)
async def delete_tour(
    tour_id: uuid.UUID, role: PartnerRole = Depends(require_expert), db: AsyncSession = Depends(get_db)
):
    await service.delete_tour(db, role, tour_id)


@router.post("/{tour_id}/submit", response_model=TourRead)
async def submit_tour(
    tour_id: uuid.UUID, role: PartnerRole = Depends(require_expert), db: AsyncSession = Depends(get_db)
):
    return await service.submit_for_review(db, role, tour_id)


@router.post("/{tour_id}/itinerary", response_model=TourRead)
async def add_itinerary_day(
    tour_id: uuid.UUID,
    payload: ItineraryDayCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_itinerary_day(db, role, tour_id, payload)


@router.delete("/{tour_id}/itinerary/{item_id}", response_model=TourRead)
async def delete_itinerary_day(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "itinerary", item_id)


@router.post("/{tour_id}/departures", response_model=TourRead)
async def add_departure(
    tour_id: uuid.UUID,
    payload: DepartureCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_departure(db, role, tour_id, payload)


@router.delete("/{tour_id}/departures/{item_id}", response_model=TourRead)
async def delete_departure(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "departures", item_id)


@router.post("/{tour_id}/meals", response_model=TourRead)
async def add_meal(
    tour_id: uuid.UUID,
    payload: MealCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_meal(db, role, tour_id, payload)


@router.delete("/{tour_id}/meals/{item_id}", response_model=TourRead)
async def delete_meal(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "meals", item_id)


@router.post("/{tour_id}/activities", response_model=TourRead)
async def add_activity(
    tour_id: uuid.UUID,
    payload: ActivityCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_activity(db, role, tour_id, payload)


@router.delete("/{tour_id}/activities/{item_id}", response_model=TourRead)
async def delete_activity(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "activities", item_id)


@router.post("/{tour_id}/addons", response_model=TourRead)
async def add_addon(
    tour_id: uuid.UUID,
    payload: AddonCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_addon(db, role, tour_id, payload)


@router.delete("/{tour_id}/addons/{item_id}", response_model=TourRead)
async def delete_addon(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "addons", item_id)


@router.post("/{tour_id}/transport", response_model=TourRead)
async def add_transport(
    tour_id: uuid.UUID,
    payload: TransportCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_transport(db, role, tour_id, payload)


@router.delete("/{tour_id}/transport/{item_id}", response_model=TourRead)
async def delete_transport(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "transport", item_id)


@router.post("/{tour_id}/stays", response_model=TourRead)
async def add_stay(
    tour_id: uuid.UUID,
    payload: TourStayCreate,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_stay(db, role, tour_id, payload)


@router.delete("/{tour_id}/stays/{item_id}", response_model=TourRead)
async def delete_stay(
    tour_id: uuid.UUID,
    item_id: uuid.UUID,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_child(db, role, tour_id, "stays", item_id)


@router.post("/{tour_id}/locations", response_model=list[LocationTagRead])
async def set_tour_locations(
    tour_id: uuid.UUID,
    payload: LocationTagSet,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    await service.get_own_tour_or_404(db, role, tour_id)  # ownership check
    return await locations_service.set_tags(db, TaggableEntityType.TOUR, tour_id, payload.location_ids)


@router.get("/{tour_id}/locations", response_model=list[LocationTagRead])
async def get_tour_locations(tour_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await locations_service.get_tags(db, TaggableEntityType.TOUR, tour_id)
