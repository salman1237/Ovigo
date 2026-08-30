from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.locations import service as locations_service
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
    db: AsyncSession = Depends(get_db),
):
    location_ids = None
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
    return await service.search_stays(db, location_ids, check_in, check_out, guests)


@router.get("/experts", response_model=list[ExpertSearchResult])
async def search_experts(location_slug: str | None = None, db: AsyncSession = Depends(get_db)):
    location_ids = None
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
    return await service.search_experts(db, location_ids)


@router.get("/destinations", response_model=list[DestinationSummary])
async def get_destinations(db: AsyncSession = Depends(get_db)):
    return await service.get_destinations(db)
