import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.permissions import require_admin
from app.database import get_db
from app.modules.cms import service
from app.modules.cms.schemas import (
    CategoryTileCreate,
    CategoryTileRead,
    CategoryTileUpdate,
    FeaturedListingRead,
    HomepageRead,
    HomepageSettingsRead,
    HomepageSettingsUpdate,
    ReorderTilesRequest,
    SetFeaturedListingsRequest,
)
from app.modules.locations.models import TaggableEntityType
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/cms", tags=["cms"])
admin_router = APIRouter(prefix="/api/v1/admin/cms", tags=["admin", "cms"], dependencies=[Depends(require_admin)])


# --- public ---


@router.get("/homepage", response_model=HomepageRead)
async def get_public_homepage(db: AsyncSession = Depends(get_db)):
    return await service.get_public_homepage(db)


@router.get("/homepage/hero-image")
async def get_hero_image(db: AsyncSession = Depends(get_db)):
    data, content_type = await service.get_hero_image(db)
    return Response(content=data, media_type=content_type, headers=storage.MUTABLE_IMAGE_CACHE_HEADERS)


@router.get("/homepage/banner-image")
async def get_banner_image(db: AsyncSession = Depends(get_db)):
    data, content_type = await service.get_banner_image(db)
    return Response(content=data, media_type=content_type, headers=storage.MUTABLE_IMAGE_CACHE_HEADERS)


@router.get("/homepage/tiles/{tile_id}/image")
async def get_tile_image(tile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    data, content_type = await service.get_tile_image(db, tile_id)
    return Response(content=data, media_type=content_type, headers=storage.MUTABLE_IMAGE_CACHE_HEADERS)


# --- admin: settings text ---


@admin_router.get("/homepage", response_model=HomepageSettingsRead)
async def admin_get_settings(db: AsyncSession = Depends(get_db)):
    return await service.admin_get_settings(db)


@admin_router.put("/homepage", response_model=HomepageSettingsRead)
async def admin_update_settings(
    payload: HomepageSettingsUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.admin_update_settings(db, admin, payload)


@admin_router.post("/homepage/hero-image", status_code=204)
async def admin_set_hero_image(
    file: UploadFile = File(...), admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    data = await file.read()
    await service.admin_set_hero_image(
        db, admin, file.filename or "hero", file.content_type or "application/octet-stream", data
    )


@admin_router.delete("/homepage/hero-image", status_code=204)
async def admin_clear_hero_image(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await service.admin_clear_hero_image(db, admin)


@admin_router.post("/homepage/banner-image", status_code=204)
async def admin_set_banner_image(
    file: UploadFile = File(...), admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    data = await file.read()
    await service.admin_set_banner_image(
        db, admin, file.filename or "banner", file.content_type or "application/octet-stream", data
    )


@admin_router.delete("/homepage/banner-image", status_code=204)
async def admin_clear_banner_image(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await service.admin_clear_banner_image(db, admin)


# --- admin: featured listings ---


@admin_router.get("/homepage/featured", response_model=list[FeaturedListingRead])
async def admin_list_featured(entity_type: TaggableEntityType, db: AsyncSession = Depends(get_db)):
    return await service.admin_list_featured(db, entity_type)


@admin_router.put("/homepage/featured", response_model=list[FeaturedListingRead])
async def admin_set_featured(
    entity_type: TaggableEntityType, payload: SetFeaturedListingsRequest, db: AsyncSession = Depends(get_db)
):
    return await service.admin_set_featured(db, entity_type, payload.entity_ids)


# --- admin: category tiles ---


@admin_router.get("/homepage/tiles", response_model=list[CategoryTileRead])
async def admin_list_tiles(db: AsyncSession = Depends(get_db)):
    return await service.admin_list_tiles(db)


@admin_router.post("/homepage/tiles", response_model=CategoryTileRead, status_code=201)
async def admin_create_tile(payload: CategoryTileCreate, db: AsyncSession = Depends(get_db)):
    return await service.admin_create_tile(db, payload)


@admin_router.put("/homepage/tiles/reorder", response_model=list[CategoryTileRead])
async def admin_reorder_tiles(payload: ReorderTilesRequest, db: AsyncSession = Depends(get_db)):
    return await service.admin_reorder_tiles(db, payload.tile_ids)


@admin_router.put("/homepage/tiles/{tile_id}", response_model=CategoryTileRead)
async def admin_update_tile(tile_id: uuid.UUID, payload: CategoryTileUpdate, db: AsyncSession = Depends(get_db)):
    return await service.admin_update_tile(db, tile_id, payload)


@admin_router.delete("/homepage/tiles/{tile_id}", status_code=204)
async def admin_delete_tile(tile_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await service.admin_delete_tile(db, tile_id)


@admin_router.post("/homepage/tiles/{tile_id}/image", response_model=CategoryTileRead)
async def admin_set_tile_image(tile_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    data = await file.read()
    return await service.admin_set_tile_image(
        db, tile_id, file.filename or "tile", file.content_type or "application/octet-stream", data
    )
