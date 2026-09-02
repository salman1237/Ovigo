"""Generic location-tagging helpers, shared by any module that needs to tag its
entities to locations (partner roles today; tours/properties in Sprint 5-6)."""
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.locations.models import Location, LocationTag, TaggableEntityType


async def set_tags(
    db: AsyncSession,
    entity_type: TaggableEntityType,
    entity_id: uuid.UUID,
    location_ids: list[uuid.UUID],
) -> list[LocationTag]:
    """Replace all location tags for an entity with the given set."""
    await db.execute(
        delete(LocationTag).where(
            LocationTag.entity_type == entity_type, LocationTag.entity_id == entity_id
        )
    )
    tags = [
        LocationTag(entity_type=entity_type, entity_id=entity_id, location_id=loc_id)
        for loc_id in dict.fromkeys(location_ids)  # de-dupe, preserve order
    ]
    db.add_all(tags)
    await db.commit()
    return await get_tags(db, entity_type, entity_id)


async def get_tags(
    db: AsyncSession, entity_type: TaggableEntityType, entity_id: uuid.UUID
) -> list[LocationTag]:
    result = await db.execute(
        select(LocationTag)
        .where(LocationTag.entity_type == entity_type, LocationTag.entity_id == entity_id)
        .options(selectinload(LocationTag.location))
    )
    return list(result.scalars().all())


async def has_tags(db: AsyncSession, entity_type: TaggableEntityType, entity_id: uuid.UUID) -> bool:
    return len(await get_tags(db, entity_type, entity_id)) > 0


async def get_exact_match_ids(
    db: AsyncSession, entity_type: TaggableEntityType, entity_ids: list[uuid.UUID], exact_location_id: uuid.UUID
) -> set[uuid.UUID]:
    """Which of `entity_ids` are tagged directly to `exact_location_id` — as opposed to
    only matching a search because that location's subtree included one of their
    tags. Used by core/ranking.py's `relevance_for` to rank an exact location match
    above a broader-ancestor match. See resolve_slug_to_subtree_ids for how a search
    accumulates the subtree in the first place."""
    if not entity_ids:
        return set()
    result = await db.execute(
        select(LocationTag.entity_id).where(
            LocationTag.entity_type == entity_type,
            LocationTag.entity_id.in_(entity_ids),
            LocationTag.location_id == exact_location_id,
        )
    )
    return set(result.scalars().all())


async def get_ancestor_ids(db: AsyncSession, location_id: uuid.UUID) -> list[uuid.UUID]:
    """The reverse of resolve_slug_to_subtree_ids: given one location, return its own id
    plus every ancestor's id, walking up via parent_id. Used by the bidding module's
    expert-eligibility check — an expert tagged to 'Chittagong' should be eligible for a
    request tagged to 'Cox's Bazar' underneath it, not just an exact location match."""
    result = await db.execute(select(Location))
    by_id = {loc.id: loc for loc in result.scalars().all()}

    ids: list[uuid.UUID] = []
    current_id: uuid.UUID | None = location_id
    while current_id is not None and current_id in by_id:
        ids.append(current_id)
        current_id = by_id[current_id].parent_id
    return ids


async def resolve_slug_to_subtree_ids(db: AsyncSession, slug: str) -> list[uuid.UUID] | None:
    """A destination search for e.g. 'bangladesh' should also surface listings tagged to
    'coxs-bazar' underneath it. Walks the small in-memory location tree (data volumes are
    tiny at this stage — revisit with a recursive CTE if that changes) and returns the
    matched location's id plus every descendant's id. Returns None if the slug doesn't
    match any location, so callers can distinguish "no filter" from "no matches"."""
    result = await db.execute(select(Location))
    all_locations = list(result.scalars().all())
    root = next((loc for loc in all_locations if loc.slug == slug), None)
    if root is None:
        return None

    by_parent: dict[uuid.UUID | None, list[Location]] = {}
    for loc in all_locations:
        by_parent.setdefault(loc.parent_id, []).append(loc)

    ids = [root.id]
    stack = [root.id]
    while stack:
        current = stack.pop()
        for child in by_parent.get(current, []):
            ids.append(child.id)
            stack.append(child.id)
    return ids
