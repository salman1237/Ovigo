import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user_optional
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.locations.schemas import LocationTagRead, LocationTagSet
from app.modules.stays import service
from app.modules.stays.schemas import (
    AmenitySet,
    AvailabilityRangeSet,
    AvailabilityRead,
    PropertyCreate,
    PropertyRead,
    PropertySummary,
    PropertyUpdate,
    RoomTypeCreate,
)
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/properties", tags=["stays"])

require_host = require_approved_role(PartnerRoleType.HOST, PartnerRoleType.HOTEL)


async def _viewer_role(
    current_user: User | None = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)
) -> PartnerRole | None:
    if current_user is None:
        return None
    result = await db.execute(
        select(PartnerRole)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(
            PartnerAccount.user_id == current_user.id,
            PartnerRole.role_type.in_([PartnerRoleType.HOST, PartnerRoleType.HOTEL]),
        )
    )
    return result.scalars().first()


@router.post("", response_model=PropertyRead, status_code=201)
async def create_property(
    payload: PropertyCreate, role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)
):
    return await service.create_property(db, role, payload)


@router.get("", response_model=list[PropertySummary])
async def list_published_properties(location_slug: str | None = None, db: AsyncSession = Depends(get_db)):
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
        return await service.list_published_properties(db, location_ids)
    return await service.list_published_properties(db, None)


@router.get("/mine", response_model=list[PropertyRead])
async def list_my_properties(role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)):
    return await service.list_my_properties(db, role)


@router.get("/{property_id}", response_model=PropertyRead)
async def get_property(
    property_id: uuid.UUID,
    viewer_role: PartnerRole | None = Depends(_viewer_role),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_property_for_view(db, property_id, viewer_role)


@router.put("/{property_id}", response_model=PropertyRead)
async def update_property(
    property_id: uuid.UUID,
    payload: PropertyUpdate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_property(db, role, property_id, payload)


@router.delete("/{property_id}", status_code=204)
async def delete_property(
    property_id: uuid.UUID, role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)
):
    await service.delete_property(db, role, property_id)


@router.post("/{property_id}/submit", response_model=PropertyRead)
async def submit_property(
    property_id: uuid.UUID, role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)
):
    return await service.submit_for_review(db, role, property_id)


@router.post("/{property_id}/room-types", response_model=PropertyRead)
async def add_room_type(
    property_id: uuid.UUID,
    payload: RoomTypeCreate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.add_room_type(db, role, property_id, payload)


@router.delete("/{property_id}/room-types/{room_type_id}", response_model=PropertyRead)
async def delete_room_type(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_room_type(db, role, property_id, room_type_id)


@router.put("/{property_id}/amenities", response_model=PropertyRead)
async def set_amenities(
    property_id: uuid.UUID,
    payload: AmenitySet,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.set_amenities(db, role, property_id, payload)


@router.put("/{property_id}/calendar", status_code=204)
async def set_calendar(
    property_id: uuid.UUID,
    payload: AvailabilityRangeSet,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    await service.get_own_property_or_404(db, role, property_id)  # ownership check
    await service.set_availability_range(db, role, payload)


@router.get("/{property_id}/calendar", response_model=list[AvailabilityRead])
async def get_calendar(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    start_date: date,
    end_date: date,
    viewer_role: PartnerRole | None = Depends(_viewer_role),
    db: AsyncSession = Depends(get_db),
):
    await service.get_property_for_view(db, property_id, viewer_role)  # visible to public (if published) or owner
    return await service.get_availability(db, room_type_id, start_date, end_date)


@router.post("/{property_id}/images", response_model=PropertyRead)
async def add_property_image(
    property_id: uuid.UUID,
    file: UploadFile = File(...),
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    return await service.add_image(
        db, role, property_id, file.filename or "image", file.content_type or "application/octet-stream", data
    )


@router.delete("/{property_id}/images/{image_id}", response_model=PropertyRead)
async def delete_property_image(
    property_id: uuid.UUID,
    image_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_image(db, role, property_id, image_id)


@router.get("/{property_id}/images/{image_id}/file")
async def get_property_image_file(
    property_id: uuid.UUID,
    image_id: uuid.UUID,
    viewer_role: PartnerRole | None = Depends(_viewer_role),
    db: AsyncSession = Depends(get_db),
):
    await service.get_property_for_view(db, property_id, viewer_role)  # visibility gate
    image = await service.get_image_or_404(db, property_id, image_id)
    return Response(content=storage.get_bytes(image.storage_key), media_type=image.content_type)


@router.post("/{property_id}/locations", response_model=list[LocationTagRead])
async def set_property_locations(
    property_id: uuid.UUID,
    payload: LocationTagSet,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    await service.get_own_property_or_404(db, role, property_id)
    return await locations_service.set_tags(db, TaggableEntityType.PROPERTY, property_id, payload.location_ids)


@router.get("/{property_id}/locations", response_model=list[LocationTagRead])
async def get_property_locations(property_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await locations_service.get_tags(db, TaggableEntityType.PROPERTY, property_id)
