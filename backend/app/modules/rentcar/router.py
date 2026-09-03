import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import recommendations
from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user_optional
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.locations.schemas import LocationTagRead, LocationTagSet
from app.modules.rentcar import service
from app.modules.rentcar.schemas import (
    DriverCreate,
    DriverRead,
    VehicleAvailabilityRangeSet,
    VehicleAvailabilityRead,
    VehicleCreate,
    VehicleRead,
    VehicleUpdate,
)
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/vehicles", tags=["rent-a-car"])
drivers_router = APIRouter(prefix="/api/v1/drivers", tags=["rent-a-car"])


@router.post("", response_model=VehicleRead, status_code=201)
async def create_vehicle(
    payload: VehicleCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_vehicle(db, role, payload)


@router.get("", response_model=list[VehicleRead])
async def list_published_vehicles(location_slug: str | None = None, q: str | None = None, db: AsyncSession = Depends(get_db)):
    location_ids = None
    if location_slug:
        location_ids = await locations_service.resolve_slug_to_subtree_ids(db, location_slug)
        if location_ids is None:
            return []
    return await service.list_published_vehicles(db, location_ids, q)


@router.get("/mine", response_model=list[VehicleRead])
async def list_my_vehicles(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_vehicles(db, role)


@router.get("/availability", response_model=list[VehicleAvailabilityRead])
async def get_availability(
    vehicle_id: uuid.UUID = Query(...),
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_availability(db, vehicle_id, start, end)


@router.put("/availability", status_code=204)
async def set_availability(
    payload: VehicleAvailabilityRangeSet,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    await service.set_availability_range(db, role, payload)


@router.get("/{vehicle_id}", response_model=VehicleRead)
async def get_vehicle(
    vehicle_id: uuid.UUID,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    viewer_role = None
    if current_user is not None:
        result = await db.execute(
            select(PartnerRole)
            .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerAccount.user_id == current_user.id, PartnerRole.role_type == PartnerRoleType.RENT_A_CAR)
        )
        viewer_role = result.scalars().first()
    return await service.get_vehicle_for_view(db, vehicle_id, viewer_role)


@router.put("/{vehicle_id}", response_model=VehicleRead)
async def update_vehicle(
    vehicle_id: uuid.UUID,
    payload: VehicleUpdate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_vehicle(db, role, vehicle_id, payload)


@router.delete("/{vehicle_id}", status_code=204)
async def delete_vehicle(
    vehicle_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    await service.delete_vehicle(db, role, vehicle_id)


@router.post("/{vehicle_id}/submit", response_model=VehicleRead)
async def submit_vehicle(
    vehicle_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.submit_for_review(db, role, vehicle_id)


@router.post("/{vehicle_id}/locations", response_model=list[LocationTagRead])
async def set_vehicle_locations(
    vehicle_id: uuid.UUID,
    payload: LocationTagSet,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    await service.get_own_vehicle_or_404(db, role, vehicle_id)
    return await locations_service.set_tags(db, TaggableEntityType.VEHICLE, vehicle_id, payload.location_ids)


@router.get("/{vehicle_id}/locations", response_model=list[LocationTagRead])
async def get_vehicle_locations(vehicle_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await locations_service.get_tags(db, TaggableEntityType.VEHICLE, vehicle_id)


@router.get("/{vehicle_id}/similar", response_model=list[VehicleRead])
async def get_similar_vehicles(vehicle_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    vehicle = await service.get_vehicle_for_view(db, vehicle_id, None)
    return await service.similar_vehicles(db, vehicle)


@router.get("/{vehicle_id}/frequently-booked-with", response_model=list[recommendations.RecommendedItem])
async def get_vehicle_frequently_booked_with(vehicle_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    vehicle = await service.get_vehicle_for_view(db, vehicle_id, None)
    return await recommendations.frequently_booked_with_vehicle(db, vehicle)


@drivers_router.post("", response_model=DriverRead, status_code=201)
async def create_driver(
    payload: DriverCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_driver(db, role, payload)


@drivers_router.get("/mine", response_model=list[DriverRead])
async def list_my_drivers(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_drivers(db, role)


@drivers_router.put("/{driver_id}", response_model=DriverRead)
async def update_driver(
    driver_id: uuid.UUID,
    is_available: bool,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_driver(db, role, driver_id, is_available)


@drivers_router.delete("/{driver_id}", status_code=204)
async def delete_driver(
    driver_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    await service.delete_driver(db, role, driver_id)
