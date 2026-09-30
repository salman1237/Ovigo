"""Rent-a-car ride bidding — see models.py for the overall design."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings import service as bookings_service
from app.modules.bookings.models import Booking
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.rentcar.models import Vehicle
from app.modules.ride_requests.models import RideBid, RideBidStatus, RideRequest, RideRequestStatus
from app.modules.ride_requests.schemas import RideBidCreate, RideRequestCreate
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, User

_REQUEST_EAGER = (selectinload(RideRequest.bids),)
_BID_EAGER = (
    selectinload(RideBid.rent_a_car_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
    selectinload(RideBid.vehicle),
)


async def create_request(db: AsyncSession, user: User, payload: RideRequestCreate) -> RideRequest:
    request = RideRequest(
        traveler_id=user.id,
        pickup_label=payload.pickup_label,
        pickup_lat=payload.pickup_lat,
        pickup_lng=payload.pickup_lng,
        dropoff_label=payload.dropoff_label,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
        departure_date=payload.departure_date,
        departure_time=payload.departure_time,
        passengers=payload.passengers,
        vehicle_type_preference=payload.vehicle_type_preference,
        with_driver_preference=payload.with_driver_preference,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
        notes=payload.notes,
        bid_deadline=payload.bid_deadline,
    )
    db.add(request)
    await db.commit()
    result = await db.execute(select(RideRequest).where(RideRequest.id == request.id).options(*_REQUEST_EAGER))
    return result.scalar_one()


async def list_my_requests(db: AsyncSession, user: User) -> list[RideRequest]:
    result = await db.execute(
        select(RideRequest)
        .where(RideRequest.traveler_id == user.id)
        .options(*_REQUEST_EAGER)
        .order_by(RideRequest.created_at.desc())
    )
    return list(result.scalars().all())


async def get_own_request_or_404(db: AsyncSession, user: User, request_id: uuid.UUID) -> RideRequest:
    result = await db.execute(
        select(RideRequest)
        .where(RideRequest.id == request_id, RideRequest.traveler_id == user.id)
        .options(*_REQUEST_EAGER)
    )
    request = result.scalar_one_or_none()
    if request is None:
        raise NotFoundError("Ride request not found")
    return request


async def _get_request_or_404(db: AsyncSession, request_id: uuid.UUID) -> RideRequest:
    result = await db.execute(select(RideRequest).where(RideRequest.id == request_id).options(*_REQUEST_EAGER))
    request = result.scalar_one_or_none()
    if request is None:
        raise NotFoundError("Ride request not found")
    return request


async def cancel_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> RideRequest:
    request = await get_own_request_or_404(db, user, request_id)
    if request.status != RideRequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — cannot be cancelled")
    request.status = RideRequestStatus.CANCELLED
    await db.commit()
    return await get_own_request_or_404(db, user, request_id)


async def list_open_requests(db: AsyncSession, role: PartnerRole) -> list[RideRequest]:
    """Open requests a rent-a-car partner can bid on — every open request is
    visible (no location-based eligibility gate, see models.py docstring),
    excluding ones they've already bid on (those show up in list_my_bids)."""
    result = await db.execute(
        select(RideRequest)
        .where(RideRequest.status == RideRequestStatus.OPEN)
        .options(*_REQUEST_EAGER)
        .order_by(RideRequest.created_at.desc())
    )
    requests = list(result.scalars().all())
    return [r for r in requests if not any(bid.rent_a_car_role_id == role.id for bid in r.bids)]


def _to_bid_read_dict(bid: RideBid) -> dict:
    user = bid.rent_a_car_role.partner_account.user
    return {
        "id": bid.id,
        "request_id": bid.request_id,
        "price": bid.price,
        "message": bid.message,
        "with_driver": bid.with_driver,
        "valid_until": bid.valid_until,
        "status": bid.status,
        "created_at": bid.created_at,
        "partner": {"id": bid.rent_a_car_role_id, "full_name": user.full_name},
        "vehicle": (
            {"id": bid.vehicle.id, "make": bid.vehicle.make, "model": bid.vehicle.model, "year": bid.vehicle.year}
            if bid.vehicle
            else None
        ),
    }


async def submit_bid(db: AsyncSession, role: PartnerRole, request_id: uuid.UUID, payload: RideBidCreate) -> dict:
    request = await _get_request_or_404(db, request_id)
    if request.status != RideRequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — no longer accepting bids")
    if request.bid_deadline is not None and datetime.now(timezone.utc) > request.bid_deadline:
        raise ConflictError("The bid deadline has passed")

    existing = await db.execute(
        select(RideBid.id).where(RideBid.request_id == request_id, RideBid.rent_a_car_role_id == role.id)
    )
    if existing.scalar_one_or_none():
        raise ConflictError("You've already placed a bid on this request")

    if payload.vehicle_id is not None:
        vehicle = await db.execute(
            select(Vehicle).where(Vehicle.id == payload.vehicle_id, Vehicle.rent_a_car_role_id == role.id)
        )
        if vehicle.scalar_one_or_none() is None:
            raise NotFoundError("Vehicle not found in your fleet")

    bid = RideBid(
        request_id=request_id,
        rent_a_car_role_id=role.id,
        vehicle_id=payload.vehicle_id,
        price=payload.price,
        message=payload.message,
        with_driver=payload.with_driver,
        valid_until=payload.valid_until,
    )
    db.add(bid)

    await notifications_service.notify(
        db,
        user_id=request.traveler_id,
        type=NotificationType.NEW_BID,
        title="New bid on your ride request",
        message=f"You received a new bid of {payload.price} for your ride from {request.pickup_label} to {request.dropoff_label}.",
        link=f"/rent-a-car/requests/{request.id}",
    )

    await db.commit()
    result = await db.execute(select(RideBid).where(RideBid.id == bid.id).options(*_BID_EAGER))
    return _to_bid_read_dict(result.scalar_one())


async def list_bids_for_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> list[dict]:
    await get_own_request_or_404(db, user, request_id)  # ownership check
    result = await db.execute(
        select(RideBid).where(RideBid.request_id == request_id).options(*_BID_EAGER).order_by(RideBid.price.asc())
    )
    return [_to_bid_read_dict(bid) for bid in result.scalars().all()]


async def list_my_bids(db: AsyncSession, role: PartnerRole) -> list[dict]:
    result = await db.execute(
        select(RideBid)
        .where(RideBid.rent_a_car_role_id == role.id)
        .options(*_BID_EAGER)
        .order_by(RideBid.created_at.desc())
    )
    return [_to_bid_read_dict(bid) for bid in result.scalars().all()]


async def _get_bid_or_404(db: AsyncSession, bid_id: uuid.UUID) -> RideBid:
    result = await db.execute(select(RideBid).where(RideBid.id == bid_id).options(*_BID_EAGER))
    bid = result.scalar_one_or_none()
    if bid is None:
        raise NotFoundError("Bid not found")
    return bid


async def withdraw_bid(db: AsyncSession, role: PartnerRole, bid_id: uuid.UUID) -> dict:
    bid = await _get_bid_or_404(db, bid_id)
    if bid.rent_a_car_role_id != role.id:
        raise NotFoundError("Bid not found")
    if bid.status != RideBidStatus.PENDING:
        raise ConflictError(f"Bid is {bid.status.value} — cannot be withdrawn")
    bid.status = RideBidStatus.WITHDRAWN
    await db.commit()
    return _to_bid_read_dict(await _get_bid_or_404(db, bid_id))


async def accept_bid(db: AsyncSession, user: User, request_id: uuid.UUID, bid_id: uuid.UUID) -> tuple[dict, Booking]:
    request = await get_own_request_or_404(db, user, request_id)
    if request.status != RideRequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — cannot accept a bid")

    bid = await _get_bid_or_404(db, bid_id)
    if bid.request_id != request_id:
        raise NotFoundError("Bid not found")
    if bid.status != RideBidStatus.PENDING:
        raise ConflictError(f"Bid is {bid.status.value} — cannot be accepted")

    # Inventory revalidation: the partner's role may have been suspended in the
    # time between placing the bid and the traveler accepting it.
    if bid.rent_a_car_role.status != PartnerRoleStatus.APPROVED:
        raise ConflictError("This partner is no longer approved — the bid can't be accepted")

    other_bids = await db.execute(
        select(RideBid).where(RideBid.request_id == request_id, RideBid.id != bid_id, RideBid.status == RideBidStatus.PENDING)
    )
    for other in other_bids.scalars().all():
        other.status = RideBidStatus.REJECTED
        await notifications_service.notify(
            db,
            user_id=(
                await db.execute(
                    select(PartnerAccount.user_id)
                    .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
                    .where(PartnerRole.id == other.rent_a_car_role_id)
                )
            ).scalar_one(),
            type=NotificationType.BID_REJECTED,
            title="Bid not selected",
            message="Your ride bid was not selected — the traveler chose a different bid.",
        )

    bid.status = RideBidStatus.ACCEPTED
    request.status = RideRequestStatus.CLOSED

    accepted_user_id = (
        await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == bid.rent_a_car_role_id)
        )
    ).scalar_one()
    await notifications_service.notify(
        db,
        user_id=accepted_user_id,
        type=NotificationType.BID_ACCEPTED,
        title="Your ride bid was accepted!",
        message=f"Your bid for the ride from {request.pickup_label} to {request.dropoff_label} was accepted.",
    )

    await db.commit()

    booking = await bookings_service.create_booking_from_ride_bid(db, user, bid.id, Decimal(str(bid.price)))
    return _to_bid_read_dict(await _get_bid_or_404(db, bid_id)), booking
