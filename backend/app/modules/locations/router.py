import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached, invalidate
from app.core.exceptions import NotFoundError
from app.core.permissions import require_admin
from app.database import get_db
from app.modules.locations.models import Location
from app.modules.locations.schemas import LocationCreate, LocationNode, LocationRead, LocationUpdate

_HIERARCHY_CACHE_KEY = "locations:hierarchy"

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
@cached(_HIERARCHY_CACHE_KEY, ttl_seconds=300)
async def get_hierarchy(db: AsyncSession = Depends(get_db)) -> list[LocationNode]:
    """Full location tree, rooted at every top-level (parent-less) location.

    Builds plain LocationNode objects rather than assigning into `Location.children`
    directly — writing to that ORM relationship attribute triggers SQLAlchemy's lazy-load
    machinery (to diff the current collection state) even when just overwriting it, which
    fails outside an active async greenlet.

    Cached for 5 minutes (see app/core/cache.py) — this walks the entire locations
    table on every call and is hit on effectively every page load (destination
    pickers, search filters), but locations change at admin-edit frequency, not
    per-request frequency. Admin writes below also invalidate it immediately so
    edits don't wait out the TTL.
    """
    result = await db.execute(select(Location))
    all_locations = list(result.scalars().all())
    by_parent: dict[uuid.UUID | None, list[Location]] = {}
    for loc in all_locations:
        by_parent.setdefault(loc.parent_id, []).append(loc)

    def build_node(loc: Location) -> LocationNode:
        return LocationNode(
            **LocationRead.model_validate(loc).model_dump(),
            children=[build_node(child) for child in by_parent.get(loc.id, [])],
        )

    roots = by_parent.get(None, [])
    return [build_node(root) for root in roots]


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
    invalidate(_HIERARCHY_CACHE_KEY)
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
    invalidate(_HIERARCHY_CACHE_KEY)
    return location


@router.delete("/{location_id}", status_code=204, dependencies=[Depends(require_admin)])
async def delete_location(location_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    location = await _get_location_or_404(db, location_id)
    await db.delete(location)
    await db.commit()
    invalidate(_HIERARCHY_CACHE_KEY)


@router.get("/{location_id}/children", response_model=list[LocationRead])
async def get_children(location_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> list[Location]:
    result = await db.execute(select(Location).where(Location.parent_id == location_id))
    return list(result.scalars().all())
