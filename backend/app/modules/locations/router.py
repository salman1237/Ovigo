import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.permissions import require_admin
from app.database import get_db
from app.modules.locations.models import Location
from app.modules.locations.schemas import LocationCreate, LocationNode, LocationRead, LocationUpdate

router = APIRouter(prefix="/api/v1/locations", tags=["locations"])


async def _get_location_or_404(db: AsyncSession, location_id: uuid.UUID) -> Location:
    result = await db.execute(select(Location).where(Location.id == location_id))
    location = result.scalar_one_or_none()
    if location is None:
        raise NotFoundError("Location not found")
    return location


@router.get("", response_model=list[LocationRead])
async def list_locations(
    parent_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Location]:
    query = select(Location).where(Location.parent_id == parent_id) if parent_id else select(Location)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/hierarchy", response_model=list[LocationNode])
async def get_hierarchy(db: AsyncSession = Depends(get_db)) -> list[Location]:
    """Full location tree, rooted at every top-level (parent-less) location."""
    result = await db.execute(select(Location))
    all_locations = list(result.scalars().all())
    by_parent: dict[uuid.UUID | None, list[Location]] = {}
    for loc in all_locations:
        by_parent.setdefault(loc.parent_id, []).append(loc)

    def attach_children(loc: Location) -> Location:
        loc.children = by_parent.get(loc.id, [])
        for child in loc.children:
            attach_children(child)
        return loc

    roots = by_parent.get(None, [])
    return [attach_children(root) for root in roots]


@router.get("/search", response_model=list[LocationRead])
async def search_locations(q: str, db: AsyncSession = Depends(get_db)) -> list[Location]:
    """Autocomplete search by name/slug. Upgrades to pg_trgm/full-text in the Search
    & Discovery module (technical document §16)."""
    pattern = f"%{q}%"
    result = await db.execute(
        select(Location).where(or_(Location.name.ilike(pattern), Location.slug.ilike(pattern))).limit(20)
    )
    return list(result.scalars().all())


@router.post("", response_model=LocationRead, dependencies=[Depends(require_admin)])
async def create_location(payload: LocationCreate, db: AsyncSession = Depends(get_db)) -> Location:
    location = Location(**payload.model_dump())
    db.add(location)
    await db.commit()
    await db.refresh(location)
    return location


@router.get("/{location_id}", response_model=LocationRead)
async def get_location(location_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Location:
    return await _get_location_or_404(db, location_id)


@router.put("/{location_id}", response_model=LocationRead, dependencies=[Depends(require_admin)])
async def update_location(
    location_id: uuid.UUID, payload: LocationUpdate, db: AsyncSession = Depends(get_db)
) -> Location:
    location = await _get_location_or_404(db, location_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(location, field, value)
    await db.commit()
    await db.refresh(location)
    return location


@router.delete("/{location_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_location(location_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    location = await _get_location_or_404(db, location_id)
    await db.delete(location)
    await db.commit()


@router.get("/{location_id}/children", response_model=list[LocationRead])
async def get_children(location_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> list[Location]:
    result = await db.execute(select(Location).where(Location.parent_id == location_id))
    return list(result.scalars().all())
