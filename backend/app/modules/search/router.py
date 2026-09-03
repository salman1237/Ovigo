from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.database import get_db
from app.modules.locations import service as locations_service
from app.modules.rentcar.schemas import VehicleRead
from app.modules.search import service
from app.modules.search.schemas import DestinationSummary, ExpertSearchResult
from app.modules.stays.schemas import PropertyRead

router = APIRouter(prefix="/api/v1/search", tags=["search"])


@router.get("/stays", response_model=list[PropertyRead])
async def search_stays(
    location_slug: str | None = None,
    check_in: date | None = None,
    check_out: date | None = None,
    guests: int = 1,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    location_ids = None
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
    return await service.search_stays(db, location_ids, check_in, check_out, guests, q)


@router.get("/vehicles", response_model=list[VehicleRead])
async def search_vehicles(
    location_slug: str | None = None,
    pickup: date | None = None,
    return_date: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    location_ids = None
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
    return await service.search_vehicles(db, location_ids, pickup, return_date)


@router.get("/experts", response_model=list[ExpertSearchResult])
async def search_experts(location_slug: str | None = None, db: AsyncSession = Depends(get_db)):
    location_ids = None
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
    return await service.search_experts(db, location_ids)


@router.get("/destinations", response_model=list[DestinationSummary])
@cached("search:destinations", ttl_seconds=120)
async def get_destinations(db: AsyncSession = Depends(get_db)):
    """Cached for 2 minutes — listing counts here shift whenever a tour/property is
    approved, more often than the locations tree changes, hence the shorter TTL
    than /locations/hierarchy. No write-path invalidation hook (unlike locations):
    approvals happen in the admin module, and there are enough of them that wiring
    an invalidation call in wasn't worth it next to just waiting out 2 minutes."""
    return await service.get_destinations(db)
