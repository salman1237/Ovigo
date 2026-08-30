import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.database import get_db
from app.modules.locations.models import Location
from app.modules.locations.schemas import LocationCreate, LocationRead

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])


@router.get("", response_model=list[LocationRead])
async def list_locations(
    parent_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Location]:
    query = select(Location).where(Location.parent_id == parent_id) if parent_id else select(Location)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=LocationRead, dependencies=[Depends(require_admin)])
async def create_location(payload: LocationCreate, db: AsyncSession = Depends(get_db)) -> Location:
    location = Location(**payload.model_dump())
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return location


@router.get("/{location_id}/children", response_model=list[LocationRead])
async def get_children(location_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> list[Location]:
    result = await db.execute(select(Location).where(Location.parent_id == location_id))
    return list(result.scalars().all())
