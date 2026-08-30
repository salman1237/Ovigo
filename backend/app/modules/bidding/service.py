"""Custom tour bidding — see models.py for the overall design.

Expert eligibility: an approved Local Expert is eligible to bid on a request if
any of their tagged locations is either the request's tagged location or one of
its ancestors (a "Chittagong" tag covers a "Cox's Bazar" request, matching how
destination search already treats a country tag as covering its cities).
"""
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.modules.bidding.models import BidStatus, CustomTourRequest, RequestStatus, TourBid
from app.modules.bidding.schemas import BidCreate, CustomTourRequestCreate
from app.modules.bookings import service as bookings_service
from app.modules.bookings.models import Booking
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.users.models import PartnerAccount, PartnerRole, User

_REQUEST_EAGER = (selectinload(CustomTourRequest.bids),)
_BID_EAGER = (
    selectinload(TourBid.local_expert_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
)


def _bid_count(request: CustomTourRequest) -> int:
    return len(request.bids)


async def create_request(db: AsyncSession, user: User, payload: CustomTourRequestCreate) -> CustomTourRequest:
    request = CustomTourRequest(
        traveler_id=user.id,
        title=payload.title,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        group_size=payload.group_size,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
    )
    db.add(request)
    await db.flush()
    await locations_service.set_tags(
        db, TaggableEntityType.CUSTOM_TOUR_REQUEST, request.id, [payload.location_id]
    )
    result = await db.execute(
        select(CustomTourRequest).where(CustomTourRequest.id == request.id).options(*_REQUEST_EAGER)
    )
    return result.scalar_one()


async def list_my_requests(db: AsyncSession, user: User) -> list[CustomTourRequest]:
    result = await db.execute(
        select(CustomTourRequest)
        .where(CustomTourRequest.traveler_id == user.id)
        .options(*_REQUEST_EAGER)
        .order_by(CustomTourRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def get_own_request_or_404(db: AsyncSession, user: User, request_id: uuid.UUID) -> CustomTourRequest:
    result = await db.execute(
        select(CustomTourRequest)
        .where(CustomTourRequest.id == request_id, CustomTourRequest.traveler_id == user.id)
        .options(*_REQUEST_EAGER)
    )
    request = result.scalar_one_or_none()
    if request is None:
        raise NotFoundError("Custom tour request not found")
    return request


async def _get_request_or_404(db: AsyncSession, request_id: uuid.UUID) -> CustomTourRequest:
    result = await db.execute(
        select(CustomTourRequest).where(CustomTourRequest.id == request_id).options(*_REQUEST_EAGER)
    )
    request = result.scalar_one_or_none()
    if request is None:
        raise NotFoundError("Custom tour request not found")
    return request


async def cancel_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> CustomTourRequest:
    request = await get_own_request_or_404(db, user, request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — cannot be cancelled")
    request.status = RequestStatus.CANCELLED
    await db.commit()
    return await get_own_request_or_404(db, user, request_id)


async def _is_eligible(db: AsyncSession, role: PartnerRole, request: CustomTourRequest) -> bool:
    expert_tags = await locations_service.get_tags(db, TaggableEntityType.PARTNER_ROLE, role.id)
    expert_location_ids = {tag.location_id for tag in expert_tags}
    if not expert_location_ids:
        return False

    request_tags = await locations_service.get_tags(db, TaggableEntityType.CUSTOM_TOUR_REQUEST, request.id)
    for tag in request_tags:
        ancestor_ids = await locations_service.get_ancestor_ids(db, tag.location_id)
        if expert_location_ids.intersection(ancestor_ids):
            return True
    return False


async def list_eligible_requests(db: AsyncSession, role: PartnerRole) -> list[CustomTourRequest]:
    """Open requests this expert can bid on — excludes ones they've already bid on
    (those show up in list_my_bids instead)."""
    result = await db.execute(
        select(CustomTourRequest)
        .where(CustomTourRequest.status == RequestStatus.OPEN)
        .options(*_REQUEST_EAGER)
        .order_by(CustomTourRequest.created_at.desc())
    )
    requests = list(result.scalars().all())

    eligible = []
    for request in requests:
        if any(bid.local_expert_role_id == role.id for bid in request.bids):
            continue
        if await _is_eligible(db, role, request):
            eligible.append(request)
    return eligible


def _to_bid_read_dict(bid: TourBid) -> dict:
    user = bid.local_expert_role.partner_account.user
    return {
        "id": bid.id,
        "request_id": bid.request_id,
        "price": bid.price,
        "message": bid.message,
        "itinerary": bid.itinerary,
        "status": bid.status,
        "created_at": bid.created_at,
        "expert": {"id": bid.local_expert_role_id, "full_name": user.full_name},
    }


async def submit_bid(db: AsyncSession, role: PartnerRole, request_id: uuid.UUID, payload: BidCreate) -> dict:
    request = await _get_request_or_404(db, request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — no longer accepting bids")
    if not await _is_eligible(db, role, request):
        raise AppError("You are not eligible to bid on this request", status_code=403)

    existing = await db.execute(
        select(TourBid.id).where(TourBid.request_id == request_id, TourBid.local_expert_role_id == role.id)
    )
    if existing.scalar_one_or_none():
        raise ConflictError("You've already placed a bid on this request")

    bid = TourBid(
        request_id=request_id,
        local_expert_role_id=role.id,
        price=payload.price,
        message=payload.message,
        itinerary=[day.model_dump() for day in payload.itinerary],
    )
    db.add(bid)

    await notifications_service.notify(
        db,
        user_id=request.traveler_id,
        type=NotificationType.NEW_BID,
        title="New bid on your custom tour request",
        message=f'You received a new bid of {payload.price} for "{request.title}".',
        link=f"/custom-requests/{request.id}",
    )

    await db.commit()

    result = await db.execute(select(TourBid).where(TourBid.id == bid.id).options(*_BID_EAGER))
    return _to_bid_read_dict(result.scalar_one())


async def list_bids_for_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> list[dict]:
    await get_own_request_or_404(db, user, request_id)  # ownership check
    result = await db.execute(
        select(TourBid)
        .where(TourBid.request_id == request_id)
        .options(*_BID_EAGER)
        .order_by(TourBid.price.asc())
    )
    return [_to_bid_read_dict(bid) for bid in result.scalars().all()]


async def list_my_bids(db: AsyncSession, role: PartnerRole) -> list[dict]:
    result = await db.execute(
        select(TourBid)
        .where(TourBid.local_expert_role_id == role.id)
        .options(*_BID_EAGER)
        .order_by(TourBid.created_at.desc())
    )
    return [_to_bid_read_dict(bid) for bid in result.scalars().all()]


async def _get_bid_or_404(db: AsyncSession, bid_id: uuid.UUID) -> TourBid:
    result = await db.execute(select(TourBid).where(TourBid.id == bid_id).options(*_BID_EAGER))
    bid = result.scalar_one_or_none()
    if bid is None:
        raise NotFoundError("Bid not found")
    return bid


async def withdraw_bid(db: AsyncSession, role: PartnerRole, bid_id: uuid.UUID) -> dict:
    bid = await _get_bid_or_404(db, bid_id)
    if bid.local_expert_role_id != role.id:
        raise NotFoundError("Bid not found")
    if bid.status != BidStatus.PENDING:
        raise ConflictError(f"Bid is {bid.status.value} — cannot be withdrawn")
    bid.status = BidStatus.WITHDRAWN
    await db.commit()
    return _to_bid_read_dict(await _get_bid_or_404(db, bid_id))


async def accept_bid(db: AsyncSession, user: User, request_id: uuid.UUID, bid_id: uuid.UUID) -> tuple[dict, Booking]:
    request = await get_own_request_or_404(db, user, request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — cannot accept a bid")

    bid = await _get_bid_or_404(db, bid_id)
    if bid.request_id != request_id:
        raise NotFoundError("Bid not found")
    if bid.status != BidStatus.PENDING:
        raise ConflictError(f"Bid is {bid.status.value} — cannot be accepted")

    other_bids = await db.execute(
        select(TourBid).where(TourBid.request_id == request_id, TourBid.id != bid_id, TourBid.status == BidStatus.PENDING)
    )
    for other in other_bids.scalars().all():
        other.status = BidStatus.REJECTED
        await notifications_service.notify(
            db,
            user_id=(
                await db.execute(
                    select(PartnerAccount.user_id)
                    .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
                    .where(PartnerRole.id == other.local_expert_role_id)
                )
            ).scalar_one(),
            type=NotificationType.BID_REJECTED,
            title="Bid not selected",
            message=f'Your bid on "{request.title}" was not selected — the traveler chose a different bid.',
        )

    bid.status = BidStatus.ACCEPTED
    request.status = RequestStatus.CLOSED

    accepted_user_id = (
        await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == bid.local_expert_role_id)
        )
    ).scalar_one()
    await notifications_service.notify(
        db,
        user_id=accepted_user_id,
        type=NotificationType.BID_ACCEPTED,
        title="Your bid was accepted!",
        message=f'Your bid on "{request.title}" was accepted. Proceed to arrange payment with the traveler.',
    )

    await db.commit()

    booking = await bookings_service.create_booking_from_bid(db, user, bid.id, Decimal(str(bid.price)))
    return _to_bid_read_dict(await _get_bid_or_404(db, bid_id)), booking
