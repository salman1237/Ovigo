import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.cms.models import CategoryTile, FeaturedListing, HomepageSettings
from app.modules.cms.schemas import (
    CategoryTileCreate,
    CategoryTileRead,
    CategoryTileUpdate,
    FeaturedListingRead,
    HomepageRead,
    HomepageSettingsRead,
    HomepageSettingsUpdate,
)
from app.modules.locations.models import TaggableEntityType
from app.modules.stays.models import Property, PropertyStatus
from app.modules.tours.models import Tour, TourStatus
from app.modules.users.models import User

_DEFAULT_TILES = [
    {"title": "Tours", "subtitle": "Fixed-date, expert-led", "link": "/tours", "gradient_from": "#2563eb", "gradient_to": "#4f46e5"},
    {"title": "Stays", "subtitle": "Hotels & homestays", "link": "/stays", "gradient_from": "#2563eb", "gradient_to": "#4f46e5"},
    {"title": "Rent a Car", "subtitle": "Sedans, SUVs & vans", "link": "/rent-a-car", "gradient_from": "#2563eb", "gradient_to": "#4338ca"},
    {"title": "eSIM", "subtitle": "190+ countries, instant", "link": "/esim", "gradient_from": "#f59e0b", "gradient_to": "#b45309"},
]

_FEATURED_ENTITY_TYPES = (TaggableEntityType.TOUR, TaggableEntityType.PROPERTY)


def _check_featured_type(entity_type: TaggableEntityType) -> None:
    if entity_type not in _FEATURED_ENTITY_TYPES:
        raise ConflictError("Only tours and properties can be featured")


async def _get_settings_row(db: AsyncSession) -> HomepageSettings:
    result = await db.execute(select(HomepageSettings).limit(1))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = HomepageSettings()
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


def _to_settings_read(settings: HomepageSettings) -> HomepageSettingsRead:
    return HomepageSettingsRead(
        hero_badge_text=settings.hero_badge_text,
        hero_headline=settings.hero_headline,
        hero_subheadline=settings.hero_subheadline,
        has_hero_image=settings.hero_image_key is not None,
        destinations_heading=settings.destinations_heading,
        destinations_subheading=settings.destinations_subheading,
        tours_heading=settings.tours_heading,
        tours_subheading=settings.tours_subheading,
        stays_heading=settings.stays_heading,
        stays_subheading=settings.stays_subheading,
        banner_heading=settings.banner_heading,
        banner_text=settings.banner_text,
        banner_cta_label=settings.banner_cta_label,
        banner_cta_link=settings.banner_cta_link,
        has_banner_image=settings.banner_image_key is not None,
        category_heading=settings.category_heading,
        category_subheading=settings.category_subheading,
        updated_at=settings.updated_at,
    )


async def admin_get_settings(db: AsyncSession) -> HomepageSettingsRead:
    return _to_settings_read(await _get_settings_row(db))


async def admin_update_settings(db: AsyncSession, admin: User, payload: HomepageSettingsUpdate) -> HomepageSettingsRead:
    settings = await _get_settings_row(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    settings.updated_by_id = admin.id
    await db.commit()
    await db.refresh(settings)
    return _to_settings_read(settings)


async def admin_set_hero_image(db: AsyncSession, admin: User, file_name: str, content_type: str, data: bytes) -> None:
    storage.validate_image(content_type, len(data))
    settings = await _get_settings_row(db)
    key = storage.build_key("cms/hero", file_name)
    storage.upload_bytes(key, data, content_type)
    old_key = settings.hero_image_key
    settings.hero_image_key = key
    settings.hero_image_content_type = content_type
    settings.updated_by_id = admin.id
    await db.commit()
    if old_key:
        storage.delete_object(old_key)


async def admin_clear_hero_image(db: AsyncSession, admin: User) -> None:
    settings = await _get_settings_row(db)
    old_key = settings.hero_image_key
    settings.hero_image_key = None
    settings.hero_image_content_type = None
    settings.updated_by_id = admin.id
    await db.commit()
    if old_key:
        storage.delete_object(old_key)


async def admin_set_banner_image(db: AsyncSession, admin: User, file_name: str, content_type: str, data: bytes) -> None:
    storage.validate_image(content_type, len(data))
    settings = await _get_settings_row(db)
    key = storage.build_key("cms/banner", file_name)
    storage.upload_bytes(key, data, content_type)
    old_key = settings.banner_image_key
    settings.banner_image_key = key
    settings.banner_image_content_type = content_type
    settings.updated_by_id = admin.id
    await db.commit()
    if old_key:
        storage.delete_object(old_key)


async def admin_clear_banner_image(db: AsyncSession, admin: User) -> None:
    settings = await _get_settings_row(db)
    old_key = settings.banner_image_key
    settings.banner_image_key = None
    settings.banner_image_content_type = None
    settings.updated_by_id = admin.id
    await db.commit()
    if old_key:
        storage.delete_object(old_key)


async def get_hero_image(db: AsyncSession) -> tuple[bytes, str]:
    settings = await _get_settings_row(db)
    if settings.hero_image_key is None:
        raise NotFoundError("No hero image set")
    return await storage.get_bytes_async(settings.hero_image_key), settings.hero_image_content_type


async def get_banner_image(db: AsyncSession) -> tuple[bytes, str]:
    settings = await _get_settings_row(db)
    if settings.banner_image_key is None:
        raise NotFoundError("No banner image set")
    return await storage.get_bytes_async(settings.banner_image_key), settings.banner_image_content_type


# --- Featured listings ---


async def _resolve_featured(db: AsyncSession, entity_type: TaggableEntityType) -> list[FeaturedListingRead]:
    result = await db.execute(
        select(FeaturedListing.entity_id)
        .where(FeaturedListing.entity_type == entity_type)
        .order_by(FeaturedListing.sort_order)
    )
    pinned_ids = [row[0] for row in result.all()]
    if not pinned_ids:
        return []

    if entity_type == TaggableEntityType.TOUR:
        result = await db.execute(select(Tour).where(Tour.id.in_(pinned_ids), Tour.status == TourStatus.PUBLISHED))
        by_id = {t.id: t.title for t in result.scalars().all()}
    else:
        result = await db.execute(select(Property).where(Property.id.in_(pinned_ids), Property.status == PropertyStatus.PUBLISHED))
        by_id = {p.id: p.name for p in result.scalars().all()}

    return [FeaturedListingRead(entity_id=eid, title=by_id[eid]) for eid in pinned_ids if eid in by_id]


async def admin_list_featured(db: AsyncSession, entity_type: TaggableEntityType) -> list[FeaturedListingRead]:
    _check_featured_type(entity_type)
    return await _resolve_featured(db, entity_type)


async def admin_set_featured(db: AsyncSession, entity_type: TaggableEntityType, entity_ids: list[uuid.UUID]) -> list[FeaturedListingRead]:
    _check_featured_type(entity_type)
    await db.execute(
        FeaturedListing.__table__.delete().where(FeaturedListing.entity_type == entity_type)
    )
    for i, entity_id in enumerate(dict.fromkeys(entity_ids)):
        db.add(FeaturedListing(entity_type=entity_type, entity_id=entity_id, sort_order=i))
    await db.commit()
    return await _resolve_featured(db, entity_type)


# --- Category tiles ---


async def _get_or_seed_tiles(db: AsyncSession) -> list[CategoryTile]:
    result = await db.execute(select(CategoryTile).order_by(CategoryTile.sort_order))
    tiles = list(result.scalars().all())
    if tiles:
        return tiles
    for i, defaults in enumerate(_DEFAULT_TILES):
        tile = CategoryTile(sort_order=i, **defaults)
        db.add(tile)
        tiles.append(tile)
    await db.commit()
    for tile in tiles:
        await db.refresh(tile)
    return tiles


def _to_tile_read(tile: CategoryTile) -> CategoryTileRead:
    return CategoryTileRead(
        id=tile.id,
        title=tile.title,
        subtitle=tile.subtitle,
        link=tile.link,
        has_image=tile.image_key is not None,
        gradient_from=tile.gradient_from,
        gradient_to=tile.gradient_to,
        sort_order=tile.sort_order,
        is_active=tile.is_active,
        updated_at=tile.updated_at,
    )


async def list_active_tiles(db: AsyncSession) -> list[CategoryTileRead]:
    tiles = await _get_or_seed_tiles(db)
    return [_to_tile_read(t) for t in tiles if t.is_active]


async def admin_list_tiles(db: AsyncSession) -> list[CategoryTileRead]:
    tiles = await _get_or_seed_tiles(db)
    return [_to_tile_read(t) for t in tiles]


async def _get_tile_or_404(db: AsyncSession, tile_id: uuid.UUID) -> CategoryTile:
    result = await db.execute(select(CategoryTile).where(CategoryTile.id == tile_id))
    tile = result.scalar_one_or_none()
    if tile is None:
        raise NotFoundError("Category tile not found")
    return tile


async def admin_create_tile(db: AsyncSession, payload: CategoryTileCreate) -> CategoryTileRead:
    result = await db.execute(select(CategoryTile.sort_order).order_by(CategoryTile.sort_order.desc()).limit(1))
    max_order = result.scalar_one_or_none()
    tile = CategoryTile(**payload.model_dump(exclude_unset=True), sort_order=(max_order or 0) + 1)
    db.add(tile)
    await db.commit()
    await db.refresh(tile)
    return _to_tile_read(tile)


async def admin_update_tile(db: AsyncSession, tile_id: uuid.UUID, payload: CategoryTileUpdate) -> CategoryTileRead:
    tile = await _get_tile_or_404(db, tile_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tile, field, value)
    await db.commit()
    await db.refresh(tile)
    return _to_tile_read(tile)


async def admin_delete_tile(db: AsyncSession, tile_id: uuid.UUID) -> None:
    tile = await _get_tile_or_404(db, tile_id)
    if tile.image_key:
        storage.delete_object(tile.image_key)
    await db.delete(tile)
    await db.commit()


async def admin_reorder_tiles(db: AsyncSession, tile_ids: list[uuid.UUID]) -> list[CategoryTileRead]:
    tiles = await _get_or_seed_tiles(db)
    by_id = {t.id: t for t in tiles}
    for i, tile_id in enumerate(tile_ids):
        if tile_id in by_id:
            by_id[tile_id].sort_order = i
    await db.commit()
    return await admin_list_tiles(db)


async def admin_set_tile_image(db: AsyncSession, tile_id: uuid.UUID, file_name: str, content_type: str, data: bytes) -> CategoryTileRead:
    storage.validate_image(content_type, len(data))
    tile = await _get_tile_or_404(db, tile_id)
    key = storage.build_key("cms/tiles", file_name)
    storage.upload_bytes(key, data, content_type)
    old_key = tile.image_key
    tile.image_key = key
    tile.image_content_type = content_type
    await db.commit()
    await db.refresh(tile)
    if old_key:
        storage.delete_object(old_key)
    return _to_tile_read(tile)


async def get_tile_image(db: AsyncSession, tile_id: uuid.UUID) -> tuple[bytes, str]:
    tile = await _get_tile_or_404(db, tile_id)
    if tile.image_key is None:
        raise NotFoundError("No image set for this tile")
    return await storage.get_bytes_async(tile.image_key), tile.image_content_type


# --- Public, fully-resolved homepage ---


async def get_public_homepage(db: AsyncSession) -> HomepageRead:
    settings = await _get_settings_row(db)
    featured_tours = await _resolve_featured(db, TaggableEntityType.TOUR)
    featured_properties = await _resolve_featured(db, TaggableEntityType.PROPERTY)
    tiles = await list_active_tiles(db)
    return HomepageRead(
        settings=_to_settings_read(settings),
        featured_tours=featured_tours,
        featured_properties=featured_properties,
        category_tiles=tiles,
    )
