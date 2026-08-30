import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.bidding import service
from app.modules.bidding.schemas import (
    BidCreate,
    BidRead,
    BidWithBookingRead,
    CustomTourRequestCreate,
    CustomTourRequestRead,
)
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/custom-requests", tags=["custom-tour-bidding"])
bids_router = APIRouter(prefix="/api/v1/bids", tags=["custom-tour-bidding"])


def _to_request_read(request) -> CustomTourRequestRead:
    return CustomTourRequestRead(
        id=request.id,
        title=request.title,
        description=request.description,
        start_date=request.start_date,
        end_date=request.end_date,
        group_size=request.group_size,
        budget_min=request.budget_min,
        budget_max=request.budget_max,
        status=request.status,
        created_at=request.created_at,
        bid_count=len(request.bids),
    )


@router.post("", response_model=CustomTourRequestRead, status_code=201)
async def create_request(
    payload: CustomTourRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    request = await service.create_request(db, current_user, payload)
    return _to_request_read(request)


@router.get("", response_model=list[CustomTourRequestRead])
async def list_my_requests(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    requests = await service.list_my_requests(db, current_user)
    return [_to_request_read(r) for r in requests]


@router.get("/{request_id}", response_model=CustomTourRequestRead)
async def get_request(
    request_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    request = await service.get_own_request_or_404(db, current_user, request_id)
    return _to_request_read(request)


@router.post("/{request_id}/cancel", response_model=CustomTourRequestRead)
async def cancel_request(
    request_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    request = await service.cancel_request(db, current_user, request_id)
    return _to_request_read(request)


@router.get("/{request_id}/bids", response_model=list[BidRead])
async def list_bids_for_request(
    request_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.list_bids_for_request(db, current_user, request_id)


@router.post("/{request_id}/bids", response_model=BidRead, status_code=201)
async def submit_bid(
    request_id: uuid.UUID,
    payload: BidCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.submit_bid(db, role, request_id, payload)


@router.post("/{request_id}/bids/{bid_id}/accept", response_model=BidWithBookingRead)
async def accept_bid(
    request_id: uuid.UUID,
    bid_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bid, booking = await service.accept_bid(db, current_user, request_id, bid_id)
    return BidWithBookingRead(bid=bid, booking_id=booking.id)


@bids_router.get("/eligible-requests", response_model=list[CustomTourRequestRead])
async def list_eligible_requests(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    requests = await service.list_eligible_requests(db, role)
    return [_to_request_read(r) for r in requests]


@bids_router.get("/mine", response_model=list[BidRead])
async def list_my_bids(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_bids(db, role)


@bids_router.post("/{bid_id}/withdraw", response_model=BidRead)
async def withdraw_bid(
    bid_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.withdraw_bid(db, role, bid_id)
