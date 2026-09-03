import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import recommendations, storage
from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user, get_current_user_optional
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.locations.schemas import LocationTagRead, LocationTagSet
from app.modules.stays import service
from app.modules.stays.schemas import (
    AmenitySet,
    AvailabilityRangeSet,
    AvailabilityRead,
    HousekeepingStatusUpdate,
    IcalImportRequest,
    IcalImportResult,
    IcalTokenRead,
    PropertyCreate,
    PropertyRead,
    PropertySummary,
    PropertyUpdate,
    RatePlanCreate,
    RatePlanRead,
    RatePlanUpdate,
    RoomCreate,
    RoomRead,
    RoomTypeCreate,
    RoomTypeUpdate,
    RoomUpdate,
    StaffInviteCreate,
    StaffRead,
)
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/properties", tags=["stays"])
staff_router = APIRouter(prefix="/api/v1/staff", tags=["stays"])
ical_router = APIRouter(prefix="/api/v1/ical", tags=["stays"])

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


@router.put("/{property_id}/room-types/{room_type_id}", response_model=PropertyRead)
async def update_room_type(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    payload: RoomTypeUpdate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_room_type(db, role, property_id, room_type_id, payload)


@router.delete("/{property_id}/room-types/{room_type_id}", response_model=PropertyRead)
async def delete_room_type(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.delete_room_type(db, role, property_id, room_type_id)


@router.post("/{property_id}/room-types/{room_type_id}/rate-plans", response_model=RatePlanRead, status_code=201)
async def create_rate_plan(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    payload: RatePlanCreate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_rate_plan(db, role, room_type_id, payload)


@router.get("/{property_id}/room-types/{room_type_id}/rate-plans", response_model=list[RatePlanRead])
async def list_rate_plans(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_rate_plans(db, role, room_type_id)


@router.put("/{property_id}/room-types/{room_type_id}/rate-plans/{rate_plan_id}", response_model=RatePlanRead)
async def update_rate_plan(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    rate_plan_id: uuid.UUID,
    payload: RatePlanUpdate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_rate_plan(db, role, room_type_id, rate_plan_id, payload)


@router.delete("/{property_id}/room-types/{room_type_id}/rate-plans/{rate_plan_id}", status_code=204)
async def delete_rate_plan(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    rate_plan_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    await service.delete_rate_plan(db, role, room_type_id, rate_plan_id)


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


@router.get("/{property_id}/similar", response_model=list[PropertySummary])
async def get_similar_properties(property_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    prop = await service.get_property_for_view(db, property_id, None)
    return await service.similar_properties(db, prop)


@router.get("/{property_id}/frequently-booked-with", response_model=list[recommendations.RecommendedItem])
async def get_property_frequently_booked_with(property_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    prop = await service.get_property_for_view(db, property_id, None)
    return await recommendations.frequently_booked_with_property(db, prop)


@router.post("/{property_id}/staff", response_model=StaffRead, status_code=201)
async def invite_staff(
    property_id: uuid.UUID,
    payload: StaffInviteCreate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.invite_staff(db, role, property_id, payload)


@router.get("/{property_id}/staff", response_model=list[StaffRead])
async def list_staff(
    property_id: uuid.UUID, role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)
):
    return await service.list_staff(db, role, property_id)


@router.delete("/{property_id}/staff/{staff_id}", status_code=204)
async def revoke_staff(
    property_id: uuid.UUID,
    staff_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    await service.revoke_staff(db, role, property_id, staff_id)


@router.post("/{property_id}/room-types/{room_type_id}/rooms", response_model=RoomRead, status_code=201)
async def create_room(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    payload: RoomCreate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_room(db, role, room_type_id, payload)


@router.get("/{property_id}/room-types/{room_type_id}/rooms", response_model=list[RoomRead])
async def list_rooms(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_rooms(db, role, room_type_id)


@router.put("/{property_id}/rooms/{room_id}", response_model=RoomRead)
async def update_room(
    property_id: uuid.UUID,
    room_id: uuid.UUID,
    payload: RoomUpdate,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_room(db, role, room_id, payload)


@router.delete("/{property_id}/rooms/{room_id}", status_code=204)
async def delete_room(
    property_id: uuid.UUID, room_id: uuid.UUID, role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)
):
    await service.delete_room(db, role, room_id)


@router.put("/{property_id}/rooms/{room_id}/housekeeping-status", response_model=RoomRead)
async def update_housekeeping_status(
    property_id: uuid.UUID,
    room_id: uuid.UUID,
    payload: HousekeepingStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_housekeeping_status_by_staff(db, current_user, property_id, room_id, payload)


@staff_router.get("/my-invitations", response_model=list[StaffRead])
async def list_my_staff_memberships(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_my_staff_memberships(db, current_user)


@staff_router.post("/{staff_id}/respond", response_model=StaffRead)
async def respond_to_staff_invite(
    staff_id: uuid.UUID,
    accept: bool,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.respond_to_staff_invite(db, current_user, staff_id, accept)


@router.get("/{property_id}/room-types/{room_type_id}/ical-token", response_model=IcalTokenRead)
async def get_ical_token(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    room_type = await service.get_or_create_ical_token(db, role, room_type_id)
    return IcalTokenRead(
        ical_token=room_type.ical_token, feed_path=service.ICAL_FEED_PATH_TEMPLATE.format(room_type_id=room_type_id)
    )


@router.post("/{property_id}/room-types/{room_type_id}/ical-token/regenerate", response_model=IcalTokenRead)
async def regenerate_ical_token(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    room_type = await service.regenerate_ical_token(db, role, room_type_id)
    return IcalTokenRead(
        ical_token=room_type.ical_token, feed_path=service.ICAL_FEED_PATH_TEMPLATE.format(room_type_id=room_type_id)
    )


@router.post("/{property_id}/room-types/{room_type_id}/ical-import", response_model=IcalImportResult)
async def import_ical(
    property_id: uuid.UUID,
    room_type_id: uuid.UUID,
    payload: IcalImportRequest,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    count = await service.import_ical(db, role, room_type_id, payload.source_url)
    return IcalImportResult(blocked_dates_count=count)


@ical_router.get("/room-types/{room_type_id}")
async def get_ical_feed(room_type_id: uuid.UUID, token: str, db: AsyncSession = Depends(get_db)):
    ics_text = await service.export_ical(db, room_type_id, token)
    return Response(content=ics_text, media_type="text/calendar")
