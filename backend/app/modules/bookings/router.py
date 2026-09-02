import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.bookings import service
from app.modules.bookings.schemas import BookingCreate, BookingRead, FrontDeskBookingCreate, RoomAssignRequest
from app.modules.stays import service as stays_service
from app.modules.stays.models import StaffRole
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/bookings", tags=["bookings"])
front_desk_router = APIRouter(prefix="/api/v1/properties", tags=["front-desk"])


@router.post("", response_model=BookingRead, status_code=201)
async def create_booking(
    payload: BookingCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.create_booking(db, current_user, payload)


@router.get("", response_model=list[BookingRead])
async def list_my_bookings(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_my_bookings(db, current_user)


@router.get("/{booking_id}", response_model=BookingRead)
async def get_booking(
    booking_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.get_own_booking_or_404(db, current_user, booking_id)


@router.post("/{booking_id}/cancel", response_model=BookingRead)
async def cancel_booking(
    booking_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.cancel_booking(db, current_user, booking_id)


@router.post("/{booking_id}/check-in", response_model=BookingRead)
async def check_in(
    booking_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.check_in(db, current_user, booking_id)


@router.post("/{booking_id}/check-out", response_model=BookingRead)
async def check_out(
    booking_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.check_out(db, current_user, booking_id)


@front_desk_router.post("/{property_id}/front-desk/bookings", response_model=BookingRead, status_code=201)
async def create_front_desk_booking(
    property_id: uuid.UUID,
    payload: FrontDeskBookingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await stays_service.assert_property_staff_access(db, current_user, property_id, StaffRole.FRONT_DESK)
    return await service.create_front_desk_booking(db, property_id, payload)


@front_desk_router.get("/{property_id}/front-desk/bookings", response_model=list[BookingRead])
async def list_front_desk_bookings(
    property_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await stays_service.assert_property_staff_access(db, current_user, property_id, StaffRole.FRONT_DESK)
    return await service.list_property_bookings(db, property_id)


@front_desk_router.post("/{property_id}/front-desk/bookings/{booking_id}/check-in", response_model=BookingRead)
async def front_desk_check_in(
    property_id: uuid.UUID,
    booking_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await stays_service.assert_property_staff_access(db, current_user, property_id, StaffRole.FRONT_DESK)
    return await service.staff_check_in(db, property_id, booking_id)


@front_desk_router.post("/{property_id}/front-desk/bookings/{booking_id}/check-out", response_model=BookingRead)
async def front_desk_check_out(
    property_id: uuid.UUID,
    booking_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await stays_service.assert_property_staff_access(db, current_user, property_id, StaffRole.FRONT_DESK)
    return await service.staff_check_out(db, property_id, booking_id)


@front_desk_router.post(
    "/{property_id}/front-desk/booking-items/{booking_item_id}/assign-room", response_model=None, status_code=204
)
async def assign_room(
    property_id: uuid.UUID,
    booking_item_id: uuid.UUID,
    payload: RoomAssignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await stays_service.assert_property_staff_access(db, current_user, property_id, StaffRole.FRONT_DESK)
    await service.assign_room(db, property_id, booking_item_id, payload.room_id)
