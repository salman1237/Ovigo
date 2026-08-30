import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.bookings import service
from app.modules.bookings.schemas import BookingCreate, BookingRead
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/bookings", tags=["bookings"])


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
