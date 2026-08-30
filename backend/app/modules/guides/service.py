"""See models.py for the overall design. Every function takes the caller's own
PartnerRole (Local Expert or Guide, resolved by `require_approved_role` in the
router) so ownership checks are just an equality comparison, matching the
pattern used throughout tours/stays/bidding.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.modules.guides.models import AssignmentStatus, GuideAssignment, GuideAvailability, GuideSupervision, SupervisionStatus
from app.modules.guides.schemas import AssignmentCreate, GuideInviteCreate
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, PartnerRoleType, User

_SUPERVISION_EAGER = (
    selectinload(GuideSupervision.local_expert_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
    selectinload(GuideSupervision.guide_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
)
_ASSIGNMENT_EAGER = (
    selectinload(GuideAssignment.guide_role).selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user),
    selectinload(GuideAssignment.tour_departure).selectinload(TourDeparture.tour),
)


def _person_summary(role: PartnerRole) -> dict:
    user = role.partner_account.user
    return {"id": role.id, "full_name": user.full_name, "email": user.email}


def _to_supervision_dict(supervision: GuideSupervision) -> dict:
    return {
        "id": supervision.id,
        "status": supervision.status,
        "created_at": supervision.created_at,
        "responded_at": supervision.responded_at,
        "expert": _person_summary(supervision.local_expert_role),
        "guide": _person_summary(supervision.guide_role),
        "guide_role_approved": supervision.guide_role.status == PartnerRoleStatus.APPROVED,
    }


def _to_assignment_dict(assignment: GuideAssignment) -> dict:
    return {
        "id": assignment.id,
        "status": assignment.status,
        "fee_amount": assignment.fee_amount,
        "checked_in_at": assignment.checked_in_at,
        "checked_out_at": assignment.checked_out_at,
        "created_at": assignment.created_at,
        "guide": _person_summary(assignment.guide_role),
        "departure": {
            "id": assignment.tour_departure_id,
            "departure_date": assignment.tour_departure.departure_date,
            "tour_title": assignment.tour_departure.tour.title,
        },
    }


async def invite_guide(db: AsyncSession, expert_role: PartnerRole, payload: GuideInviteCreate) -> dict:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundError("No Ovigo account found with that email — the guide needs to register first")

    account_result = await db.execute(select(PartnerAccount).where(PartnerAccount.user_id == user.id))
    account = account_result.scalar_one_or_none()
    if account is None:
        account = PartnerAccount(user_id=user.id)
        db.add(account)
        await db.flush()

    role_result = await db.execute(
        select(PartnerRole).where(PartnerRole.partner_account_id == account.id, PartnerRole.role_type == PartnerRoleType.GUIDE)
    )
    guide_role = role_result.scalar_one_or_none()
    if guide_role is None:
        guide_role = PartnerRole(partner_account_id=account.id, role_type=PartnerRoleType.GUIDE)
        db.add(guide_role)
        await db.flush()

    existing = await db.execute(
        select(GuideSupervision).where(
            GuideSupervision.guide_role_id == guide_role.id,
            GuideSupervision.status.in_([SupervisionStatus.PENDING, SupervisionStatus.ACCEPTED]),
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError("This person is already supervised (or has a pending invite) by an expert")

    supervision = GuideSupervision(local_expert_role_id=expert_role.id, guide_role_id=guide_role.id)
    db.add(supervision)
    await db.flush()

    await notifications_service.notify(
        db,
        user_id=user.id,
        type=NotificationType.GUIDE_INVITE,
        title="You've been invited as a Guide",
        message="A Local Expert invited you to become their supervised Guide on Ovigo.",
        link="/dashboard/guide",
    )
    await db.commit()

    result = await db.execute(select(GuideSupervision).where(GuideSupervision.id == supervision.id).options(*_SUPERVISION_EAGER))
    return _to_supervision_dict(result.scalar_one())


async def list_my_guides(db: AsyncSession, expert_role: PartnerRole) -> list[dict]:
    result = await db.execute(
        select(GuideSupervision)
        .where(GuideSupervision.local_expert_role_id == expert_role.id)
        .options(*_SUPERVISION_EAGER)
        .order_by(GuideSupervision.created_at.desc())
    )
    return [_to_supervision_dict(s) for s in result.scalars().all()]


async def get_my_supervision(db: AsyncSession, guide_role: PartnerRole) -> dict | None:
    result = await db.execute(
        select(GuideSupervision)
        .where(GuideSupervision.guide_role_id == guide_role.id)
        .options(*_SUPERVISION_EAGER)
        .order_by(GuideSupervision.created_at.desc())
        .limit(1)
    )
    supervision = result.scalar_one_or_none()
    return _to_supervision_dict(supervision) if supervision else None


async def _get_supervision_or_404(db: AsyncSession, supervision_id: uuid.UUID) -> GuideSupervision:
    result = await db.execute(
        select(GuideSupervision).where(GuideSupervision.id == supervision_id).options(*_SUPERVISION_EAGER)
    )
    supervision = result.scalar_one_or_none()
    if supervision is None:
        raise NotFoundError("Supervision record not found")
    return supervision


async def respond_to_invite(db: AsyncSession, guide_role: PartnerRole, supervision_id: uuid.UUID, accept: bool) -> dict:
    supervision = await _get_supervision_or_404(db, supervision_id)
    if supervision.guide_role_id != guide_role.id:
        raise NotFoundError("Supervision record not found")
    if supervision.status != SupervisionStatus.PENDING:
        raise ConflictError(f"This invite is {supervision.status.value}, not pending")

    supervision.status = SupervisionStatus.ACCEPTED if accept else SupervisionStatus.REJECTED
    supervision.responded_at = datetime.now(timezone.utc)

    if accept:
        expert_user_id = supervision.local_expert_role.partner_account.user_id
        await notifications_service.notify(
            db,
            user_id=expert_user_id,
            type=NotificationType.GUIDE_SUPERVISION_ACCEPTED,
            title="Guide invite accepted",
            message=f"{supervision.guide_role.partner_account.user.full_name} accepted your Guide invitation.",
        )

    await db.commit()
    return _to_supervision_dict(await _get_supervision_or_404(db, supervision_id))


async def terminate_supervision(db: AsyncSession, current_user: User, supervision_id: uuid.UUID) -> dict:
    """Either the supervising expert or the guide themselves can end an active
    supervision — no admin involvement needed, this is a private arrangement."""
    supervision = await _get_supervision_or_404(db, supervision_id)
    is_expert = supervision.local_expert_role.partner_account.user_id == current_user.id
    is_guide = supervision.guide_role.partner_account.user_id == current_user.id
    if not (is_expert or is_guide):
        raise NotFoundError("Supervision record not found")
    if supervision.status != SupervisionStatus.ACCEPTED:
        raise ConflictError(f"Supervision is {supervision.status.value} — nothing to terminate")

    supervision.status = SupervisionStatus.TERMINATED
    supervision.responded_at = datetime.now(timezone.utc)

    notify_user_id = (
        supervision.guide_role.partner_account.user_id if is_expert else supervision.local_expert_role.partner_account.user_id
    )
    await notifications_service.notify(
        db,
        user_id=notify_user_id,
        type=NotificationType.GUIDE_SUPERVISION_ENDED,
        title="Guide supervision ended",
        message="Your Guide supervision arrangement on Ovigo has ended.",
    )
    await db.commit()
    return _to_supervision_dict(await _get_supervision_or_404(db, supervision_id))


async def _active_supervision_for(db: AsyncSession, expert_role_id: uuid.UUID, guide_role_id: uuid.UUID) -> GuideSupervision | None:
    result = await db.execute(
        select(GuideSupervision)
        .where(
            GuideSupervision.local_expert_role_id == expert_role_id,
            GuideSupervision.guide_role_id == guide_role_id,
            GuideSupervision.status == SupervisionStatus.ACCEPTED,
        )
        .options(*_SUPERVISION_EAGER)
    )
    return result.scalar_one_or_none()


async def assign_guide(
    db: AsyncSession, expert_role: PartnerRole, guide_role_id: uuid.UUID, payload: AssignmentCreate
) -> dict:
    supervision = await _active_supervision_for(db, expert_role.id, guide_role_id)
    if supervision is None:
        raise AppError("This guide is not an active, accepted supervisee of yours", status_code=403)
    if supervision.guide_role.status != PartnerRoleStatus.APPROVED:
        raise ConflictError("This guide's role hasn't been admin-approved yet")

    departure_result = await db.execute(
        select(TourDeparture)
        .join(Tour, Tour.id == TourDeparture.tour_id)
        .where(TourDeparture.id == payload.tour_departure_id, Tour.local_expert_role_id == expert_role.id)
    )
    departure = departure_result.scalar_one_or_none()
    if departure is None:
        raise NotFoundError("Tour departure not found among your own tours")

    assignment = GuideAssignment(
        guide_role_id=guide_role_id,
        tour_departure_id=departure.id,
        assigned_by_role_id=expert_role.id,
        fee_amount=payload.fee_amount,
    )
    db.add(assignment)
    await db.flush()

    await notifications_service.notify(
        db,
        user_id=supervision.guide_role.partner_account.user_id,
        type=NotificationType.GUIDE_ASSIGNED,
        title="New tour assignment",
        message=f"You've been assigned to guide a departure on {departure.departure_date}.",
        link="/dashboard/guide",
    )
    await db.commit()

    result = await db.execute(select(GuideAssignment).where(GuideAssignment.id == assignment.id).options(*_ASSIGNMENT_EAGER))
    return _to_assignment_dict(result.scalar_one())


async def list_assignments_for_guide(db: AsyncSession, guide_role: PartnerRole) -> list[dict]:
    result = await db.execute(
        select(GuideAssignment)
        .where(GuideAssignment.guide_role_id == guide_role.id)
        .options(*_ASSIGNMENT_EAGER)
        .order_by(GuideAssignment.created_at.desc())
    )
    return [_to_assignment_dict(a) for a in result.scalars().all()]


async def list_assignments_by_expert(db: AsyncSession, expert_role: PartnerRole) -> list[dict]:
    result = await db.execute(
        select(GuideAssignment)
        .where(GuideAssignment.assigned_by_role_id == expert_role.id)
        .options(*_ASSIGNMENT_EAGER)
        .order_by(GuideAssignment.created_at.desc())
    )
    return [_to_assignment_dict(a) for a in result.scalars().all()]


async def _get_assignment_or_404(db: AsyncSession, assignment_id: uuid.UUID) -> GuideAssignment:
    result = await db.execute(
        select(GuideAssignment).where(GuideAssignment.id == assignment_id).options(*_ASSIGNMENT_EAGER)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise NotFoundError("Assignment not found")
    return assignment


async def check_in_assignment(db: AsyncSession, guide_role: PartnerRole, assignment_id: uuid.UUID) -> dict:
    assignment = await _get_assignment_or_404(db, assignment_id)
    if assignment.guide_role_id != guide_role.id:
        raise NotFoundError("Assignment not found")
    if assignment.status != AssignmentStatus.ASSIGNED:
        raise ConflictError(f"Assignment is {assignment.status.value} — cannot check in")
    assignment.status = AssignmentStatus.CHECKED_IN
    assignment.checked_in_at = datetime.now(timezone.utc)
    await db.commit()
    return _to_assignment_dict(await _get_assignment_or_404(db, assignment_id))


async def complete_assignment(db: AsyncSession, guide_role: PartnerRole, assignment_id: uuid.UUID) -> dict:
    assignment = await _get_assignment_or_404(db, assignment_id)
    if assignment.guide_role_id != guide_role.id:
        raise NotFoundError("Assignment not found")
    if assignment.status != AssignmentStatus.CHECKED_IN:
        raise ConflictError(f"Assignment is {assignment.status.value} — must be checked in first")
    assignment.status = AssignmentStatus.COMPLETED
    assignment.checked_out_at = datetime.now(timezone.utc)
    await db.commit()
    return _to_assignment_dict(await _get_assignment_or_404(db, assignment_id))


async def cancel_assignment(db: AsyncSession, expert_role: PartnerRole, assignment_id: uuid.UUID) -> dict:
    assignment = await _get_assignment_or_404(db, assignment_id)
    if assignment.assigned_by_role_id != expert_role.id:
        raise NotFoundError("Assignment not found")
    if assignment.status not in (AssignmentStatus.ASSIGNED, AssignmentStatus.CHECKED_IN):
        raise ConflictError(f"Assignment is {assignment.status.value} — cannot be cancelled")
    assignment.status = AssignmentStatus.CANCELLED
    await db.commit()
    return _to_assignment_dict(await _get_assignment_or_404(db, assignment_id))


async def set_availability(db: AsyncSession, guide_role: PartnerRole, dates: list[date], is_available: bool) -> None:
    for day in dates:
        result = await db.execute(
            select(GuideAvailability).where(GuideAvailability.guide_role_id == guide_role.id, GuideAvailability.date == day)
        )
        row = result.scalar_one_or_none()
        if row is None:
            db.add(GuideAvailability(guide_role_id=guide_role.id, date=day, is_available=is_available))
        else:
            row.is_available = is_available
    await db.commit()


async def list_availability(db: AsyncSession, guide_role: PartnerRole, start: date, end: date) -> list[GuideAvailability]:
    result = await db.execute(
        select(GuideAvailability)
        .where(GuideAvailability.guide_role_id == guide_role.id, GuideAvailability.date >= start, GuideAvailability.date <= end)
        .order_by(GuideAvailability.date)
    )
    return list(result.scalars().all())


async def get_earnings(db: AsyncSession, guide_role: PartnerRole) -> dict:
    result = await db.execute(
        select(GuideAssignment).where(
            GuideAssignment.guide_role_id == guide_role.id, GuideAssignment.status == AssignmentStatus.COMPLETED
        )
    )
    completed = list(result.scalars().all())
    total_fees = sum((a.fee_amount for a in completed if a.fee_amount is not None), Decimal("0"))
    return {"total_completed_assignments": len(completed), "total_fees": total_fees}
