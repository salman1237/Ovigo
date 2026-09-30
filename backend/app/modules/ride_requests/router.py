import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.ride_requests import service
from app.modules.ride_requests.schemas import (
    RideBidCreate,
    RideBidRead,
    RideBidWithBookingRead,
    RideRequestCreate,
    RideRequestRead,
)
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/ride-requests", tags=["rent-a-car-bidding"])
bids_router = APIRouter(prefix="/api/v1/ride-bids", tags=["rent-a-car-bidding"])


def _to_request_read(request) -> RideRequestRead:
    return RideRequestRead(
        id=request.id,
        pickup_label=request.pickup_label,
        pickup_lat=request.pickup_lat,
        pickup_lng=request.pickup_lng,
        dropoff_label=request.dropoff_label,
        dropoff_lat=request.dropoff_lat,
        dropoff_lng=request.dropoff_lng,
        departure_date=request.departure_date,
        departure_time=request.departure_time,
        passengers=request.passengers,
        vehicle_type_preference=request.vehicle_type_preference,
        with_driver_preference=request.with_driver_preference,
        budget_min=request.budget_min,
        budget_max=request.budget_max,
        notes=request.notes,
        bid_deadline=request.bid_deadline,
        status=request.status,
        created_at=request.created_at,
        bid_count=len(request.bids),
    )


@router.post("", response_model=RideRequestRead, status_code=201)
async def create_request(
    payload: RideRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    request = await service.create_request(db, current_user, payload)
    return _to_request_read(request)


@router.get("", response_model=list[RideRequestRead])
async def list_my_requests(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    requests = await service.list_my_requests(db, current_user)
    return [_to_request_read(r) for r in requests]


@router.get("/{request_id}", response_model=RideRequestRead)
async def get_request(
    request_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    request = await service.get_own_request_or_404(db, current_user, request_id)
    return _to_request_read(request)


@router.post("/{request_id}/cancel", response_model=RideRequestRead)
async def cancel_request(
    request_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    request = await service.cancel_request(db, current_user, request_id)
    return _to_request_read(request)


@router.get("/{request_id}/bids", response_model=list[RideBidRead])
async def list_bids_for_request(
    request_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.list_bids_for_request(db, current_user, request_id)


@router.post("/{request_id}/bids", response_model=RideBidRead, status_code=201)
async def submit_bid(
    request_id: uuid.UUID,
    payload: RideBidCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.submit_bid(db, role, request_id, payload)


@router.post("/{request_id}/bids/{bid_id}/accept", response_model=RideBidWithBookingRead)
async def accept_bid(
    request_id: uuid.UUID,
    bid_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid, booking = await service.accept_bid(db, current_user, request_id, bid_id)
    return RideBidWithBookingRead(bid=bid, booking_id=booking.id)


@bids_router.get("/open-requests", response_model=list[RideRequestRead])
async def list_open_requests(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    requests = await service.list_open_requests(db, role)
    return [_to_request_read(r) for r in requests]


@bids_router.get("/mine", response_model=list[RideBidRead])
async def list_my_bids(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_bids(db, role)


@bids_router.post("/{bid_id}/withdraw", response_model=RideBidRead)
async def withdraw_bid(
    bid_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.withdraw_bid(db, role, bid_id)
