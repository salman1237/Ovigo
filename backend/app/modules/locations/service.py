"""Generic location-tagging helpers, shared by any module that needs to tag its
entities to locations (partner roles today; tours/properties in Sprint 5-6)."""
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.locations.models import LocationTag, TaggableEntityType


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
