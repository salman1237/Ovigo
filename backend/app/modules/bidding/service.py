"""Custom tour bidding — see models.py for the overall design.

Expert eligibility: an approved Local Expert is eligible to bid on a request if
any of their tagged locations is either the request's tagged location or one of
its ancestors (a "Chittagong" tag covers a "Cox's Bazar" request, matching how
destination search already treats a country tag as covering its cities).
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.modules.bidding.models import BidStatus, CustomTourRequest, RequestQuestion, RequestStatus, TourBid
from app.modules.bidding.schemas import BidCreate, BidUpdate, CustomTourRequestCreate, RequestQuestionCreate
from app.modules.bookings import service as bookings_service
from app.modules.bookings.models import Booking
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, User

_QUESTION_EAGER = (
    selectinload(RequestQuestion.asked_by_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
)

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
        group_size=payload.adults + payload.children + payload.infants,
        adults=payload.adults,
        children=payload.children,
        infants=payload.infants,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
        pickup_location=payload.pickup_location,
        food_preference=payload.food_preference,
        accessibility_needs=payload.accessibility_needs,
        safety_privacy_notes=payload.safety_privacy_notes,
        guide_requested=payload.guide_requested,
        special_occasion=payload.special_occasion,
        additional_notes=payload.additional_notes,
        bid_deadline=payload.bid_deadline,
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
        "stay_name": bid.stay_name,
        "transport_details": bid.transport_details,
        "food_menu": bid.food_menu,
        "included_services": bid.included_services,
        "excluded_services": bid.excluded_services,
        "addons": bid.addons,
        "tax_amount": bid.tax_amount,
        "deposit_amount": bid.deposit_amount,
        "cancellation_terms": bid.cancellation_terms,
        "valid_until": bid.valid_until,
        "is_shortlisted": bid.is_shortlisted,
        "status": bid.status,
        "created_at": bid.created_at,
        "expert": {"id": bid.local_expert_role_id, "full_name": user.full_name},
    }


async def submit_bid(db: AsyncSession, role: PartnerRole, request_id: uuid.UUID, payload: BidCreate) -> dict:
    request = await _get_request_or_404(db, request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — no longer accepting bids")
    if request.bid_deadline is not None and datetime.now(timezone.utc).date() > request.bid_deadline:
        raise ConflictError(f"The bid deadline ({request.bid_deadline}) has passed")
    if not await _is_eligible(db, role, request):
        raise AppError("You are not eligible to bid on this request", status_code=403)

    existing = await db.execute(
        select(TourBid.id).where(TourBid.request_id == request_id, TourBid.local_expert_role_id == role.id)
    )
    if existing.scalar_one_or_none():
        raise ConflictError("You've already placed a bid on this request — revise it instead of placing a new one")

    bid = TourBid(
        request_id=request_id,
        local_expert_role_id=role.id,
        price=payload.price,
        message=payload.message,
        itinerary=[day.model_dump() for day in payload.itinerary],
        stay_name=payload.stay_name,
        transport_details=payload.transport_details,
        food_menu=payload.food_menu,
        included_services=payload.included_services,
        excluded_services=payload.excluded_services,
        addons=[a.model_dump(mode="json") for a in payload.addons],
        tax_amount=payload.tax_amount,
        deposit_amount=payload.deposit_amount,
        cancellation_terms=payload.cancellation_terms,
        valid_until=payload.valid_until,
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


async def update_bid(db: AsyncSession, role: PartnerRole, bid_id: uuid.UUID, payload: BidUpdate) -> dict:
    """The "Revision" step — an expert tweaks their own still-PENDING bid in place,
    rather than withdrawing (a dead end: the unique-bid-per-expert-per-request
    constraint blocks placing a fresh one afterwards) and losing their place."""
    bid = await _get_bid_or_404(db, bid_id)
    if bid.local_expert_role_id != role.id:
        raise NotFoundError("Bid not found")
    if bid.status != BidStatus.PENDING:
        raise ConflictError(f"Bid is {bid.status.value} — cannot be revised")

    request = await _get_request_or_404(db, bid.request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — no longer accepting bid revisions")
    if request.bid_deadline is not None and datetime.now(timezone.utc).date() > request.bid_deadline:
        raise ConflictError(f"The bid deadline ({request.bid_deadline}) has passed")

    updates = payload.model_dump(exclude_unset=True, exclude={"itinerary", "addons"})
    for field, value in updates.items():
        setattr(bid, field, value)
    if payload.itinerary is not None:
        bid.itinerary = [day.model_dump() for day in payload.itinerary]
    if payload.addons is not None:
        bid.addons = [a.model_dump(mode="json") for a in payload.addons]

    await notifications_service.notify(
        db,
        user_id=request.traveler_id,
        type=NotificationType.NEW_BID,
        title="A bid was revised",
        message=f'A bid on "{request.title}" was updated.',
        link=f"/custom-requests/{request.id}",
    )
    await db.commit()
    return _to_bid_read_dict(await _get_bid_or_404(db, bid_id))


async def toggle_shortlist(db: AsyncSession, user: User, request_id: uuid.UUID, bid_id: uuid.UUID) -> dict:
    await get_own_request_or_404(db, user, request_id)  # ownership check
    bid = await _get_bid_or_404(db, bid_id)
    if bid.request_id != request_id:
        raise NotFoundError("Bid not found")
    bid.is_shortlisted = not bid.is_shortlisted
    await db.commit()
    return _to_bid_read_dict(await _get_bid_or_404(db, bid_id))


def _to_question_read_dict(question: RequestQuestion) -> dict:
    user = question.asked_by_role.partner_account.user
    return {
        "id": question.id,
        "request_id": question.request_id,
        "question": question.question,
        "answer": question.answer,
        "answered_at": question.answered_at,
        "created_at": question.created_at,
        "expert": {"id": question.asked_by_role_id, "full_name": user.full_name},
    }


async def ask_question(
    db: AsyncSession, role: PartnerRole, request_id: uuid.UUID, payload: RequestQuestionCreate
) -> dict:
    request = await _get_request_or_404(db, request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — no longer accepting questions")
    if not await _is_eligible(db, role, request):
        raise AppError("You are not eligible to ask about this request", status_code=403)

    question = RequestQuestion(request_id=request_id, asked_by_role_id=role.id, question=payload.question)
    db.add(question)
    await notifications_service.notify(
        db,
        user_id=request.traveler_id,
        type=NotificationType.NEW_QUESTION,
        title="New question on your custom tour request",
        message=f'An expert asked a question about "{request.title}".',
        link=f"/custom-requests/{request.id}",
    )
    await db.commit()

    result = await db.execute(select(RequestQuestion).where(RequestQuestion.id == question.id).options(*_QUESTION_EAGER))
    return _to_question_read_dict(result.scalar_one())


async def list_questions_for_request(db: AsyncSession, user: User, request_id: uuid.UUID) -> list[dict]:
    await get_own_request_or_404(db, user, request_id)  # ownership check
    result = await db.execute(
        select(RequestQuestion)
        .where(RequestQuestion.request_id == request_id)
        .options(*_QUESTION_EAGER)
        .order_by(RequestQuestion.created_at.asc())
    )
    return [_to_question_read_dict(q) for q in result.scalars().all()]


async def list_my_questions(db: AsyncSession, role: PartnerRole, request_id: uuid.UUID) -> list[dict]:
    """An expert only sees their own questions on a request, not other experts'."""
    result = await db.execute(
        select(RequestQuestion)
        .where(RequestQuestion.request_id == request_id, RequestQuestion.asked_by_role_id == role.id)
        .options(*_QUESTION_EAGER)
        .order_by(RequestQuestion.created_at.asc())
    )
    return [_to_question_read_dict(q) for q in result.scalars().all()]


async def _get_question_or_404(db: AsyncSession, question_id: uuid.UUID) -> RequestQuestion:
    result = await db.execute(
        select(RequestQuestion).where(RequestQuestion.id == question_id).options(*_QUESTION_EAGER)
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise NotFoundError("Question not found")
    return question


async def answer_question(db: AsyncSession, user: User, request_id: uuid.UUID, question_id: uuid.UUID, answer: str) -> dict:
    await get_own_request_or_404(db, user, request_id)  # ownership check
    question = await _get_question_or_404(db, question_id)
    if question.request_id != request_id:
        raise NotFoundError("Question not found")

    question.answer = answer
    question.answered_at = datetime.now(timezone.utc)

    expert_user_id = (
        await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == question.asked_by_role_id)
        )
    ).scalar_one()
    await notifications_service.notify(
        db,
        user_id=expert_user_id,
        type=NotificationType.QUESTION_ANSWERED,
        title="Your question was answered",
        message="The traveler answered your question on their custom tour request.",
        link="/dashboard/bids",
    )
    await db.commit()
    return _to_question_read_dict(await _get_question_or_404(db, question_id))


async def accept_bid(db: AsyncSession, user: User, request_id: uuid.UUID, bid_id: uuid.UUID) -> tuple[dict, Booking]:
    request = await get_own_request_or_404(db, user, request_id)
    if request.status != RequestStatus.OPEN:
        raise ConflictError(f"Request is {request.status.value} — cannot accept a bid")

    bid = await _get_bid_or_404(db, bid_id)
    if bid.request_id != request_id:
        raise NotFoundError("Bid not found")
    if bid.status != BidStatus.PENDING:
        raise ConflictError(f"Bid is {bid.status.value} — cannot be accepted")

    # Inventory revalidation: the expert's role may have been suspended or dropped
    # in the time between placing the bid and the traveler accepting it — re-check
    # before converting to a real booking, matching the PRD flow's own step name.
    if bid.local_expert_role.status != PartnerRoleStatus.APPROVED:
        raise ConflictError("This expert is no longer an approved partner — the bid can't be accepted")

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
