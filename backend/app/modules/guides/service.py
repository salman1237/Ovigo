"""See models.py for the overall design. Every function takes the caller's own
PartnerRole (Local Expert or Guide, resolved by `require_approved_role` in the
router) so ownership checks are just an equality comparison, matching the
pattern used throughout tours/stays/bidding.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType, BookingStatus
from app.modules.commissions import service as commissions_service
from app.modules.guides.models import (
    AssignmentStatus,
    GuideAssignment,
    GuideAvailability,
    GuideCertification,
    GuideCertificationLevel,
    GuideProfile,
    GuideProfileStatus,
    GuideServicePackage,
    GuideSupervision,
    SupervisionStatus,
)
from app.modules.guides.schemas import (
    AssignmentCreate,
    GuideCertificationUpdate,
    GuideInviteCreate,
    GuidePackageCreate,
    GuidePackageUpdate,
    GuideProfileUpdate,
    GuideRestrictionUpdate,
)
from app.modules.notifications import service as notifications_service
from app.modules.referrals import service as referrals_service
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
    selectinload(GuideAssignment.package),
)
# An assignment in these states holds the guide's dates.
_ACTIVE_ASSIGNMENT = (AssignmentStatus.ASSIGNED, AssignmentStatus.CHECKED_IN, AssignmentStatus.COMPLETED)


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
        "package": {"id": assignment.package.id, "name": assignment.package.name} if assignment.package else None,
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
    expert_user = (
        await db.execute(
            select(User)
            .join(PartnerAccount, PartnerAccount.user_id == User.id)
            .where(PartnerAccount.id == expert_role.partner_account_id)
        )
    ).scalar_one()
    if user.id == expert_user.id:
        raise ConflictError("You can't invite yourself as your own guide")

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

    # A guide can work with several experts (Phase 9.3), so only this pair matters.
    # One row per pair: an ended or declined one is reused for a fresh invite.
    supervision = (
        await db.execute(
            select(GuideSupervision).where(
                GuideSupervision.guide_role_id == guide_role.id,
                GuideSupervision.local_expert_role_id == expert_role.id,
            )
        )
    ).scalar_one_or_none()
    if supervision is not None and supervision.status in (SupervisionStatus.PENDING, SupervisionStatus.ACCEPTED):
        raise ConflictError("You already work with this guide (or have a pending invite to them)")
    if supervision is None:
        supervision = GuideSupervision(local_expert_role_id=expert_role.id, guide_role_id=guide_role.id)
        db.add(supervision)
    else:
        supervision.status = SupervisionStatus.PENDING
        supervision.created_at = datetime.now(timezone.utc)
        supervision.responded_at = None
    await db.flush()
    # An expert who brings a not-yet-approved guide onto Ovigo onboarded them, and
    # earns the network cut on their work (unless another expert got there first).
    await referrals_service.attribute_guide_invite(db, expert_role, guide_role, user)

    await notifications_service.notify(
        db,
        user_id=user.id,
        type=NotificationType.GUIDE_INVITE,
        title="You've been invited as a Guide",
        message=f"{expert_user.full_name} invited you to guide their tours on Ovigo.",
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


async def list_my_supervisions(db: AsyncSession, guide_role: PartnerRole) -> list[dict]:
    """Every expert this guide works with or has been invited by, newest first."""
    result = await db.execute(
        select(GuideSupervision)
        .where(GuideSupervision.guide_role_id == guide_role.id)
        .options(*_SUPERVISION_EAGER)
        .order_by(GuideSupervision.created_at.desc())
    )
    return [_to_supervision_dict(s) for s in result.scalars().all()]


async def get_my_supervision(db: AsyncSession, guide_role: PartnerRole) -> dict | None:
    """The most recent supervision only — kept for older clients; a guide can now
    work with several experts (list_my_supervisions)."""
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
    if not accept:
        await referrals_service.drop_guide_invite_attribution(db, supervision.local_expert_role_id, guide_role.id)

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
        .options(selectinload(TourDeparture.tour).selectinload(Tour.activities))
    )
    departure = departure_result.scalar_one_or_none()
    if departure is None:
        raise NotFoundError("Tour departure not found among your own tours")

    if any(activity.is_high_risk for activity in departure.tour.activities):
        certification = await _get_certification(db, guide_role_id)
        if certification is not None and certification.is_restricted:
            raise ConflictError(
                "This guide is currently restricted from high-risk activity assignments"
                + (f" ({certification.restriction_reason})" if certification.restriction_reason else "")
            )
        level = certification.level if certification is not None else GuideCertificationLevel.NONE
        if level != GuideCertificationLevel.LEVEL_2:
            raise ConflictError(
                "This tour includes a high-risk activity — only a Level 2 certified guide can be assigned"
            )

    package = None
    if payload.package_id is not None:
        package = (
            await db.execute(
                select(GuideServicePackage).where(
                    GuideServicePackage.id == payload.package_id, GuideServicePackage.guide_role_id == guide_role_id
                )
            )
        ).scalar_one_or_none()
        if package is None or not package.is_active:
            raise NotFoundError("Package not found among this guide's current packages")
    elif payload.fee_amount is None:
        raise AppError("Choose one of the guide's packages or enter the fee you'll pay them", status_code=422)
    fee = payload.fee_amount if payload.fee_amount is not None else package.price

    await lock_guide(db, guide_role_id)
    await assert_guide_free(db, guide_role_id, departure_dates(departure), require_open=False)

    assignment = GuideAssignment(
        guide_role_id=guide_role_id,
        tour_departure_id=departure.id,
        assigned_by_role_id=expert_role.id,
        package_id=package.id if package else None,
        fee_amount=fee,
    )
    db.add(assignment)
    await db.flush()

    await notifications_service.notify(
        db,
        user_id=supervision.guide_role.partner_account.user_id,
        type=NotificationType.GUIDE_ASSIGNED,
        title="New tour assignment",
        message=f"You've been assigned to guide a departure on {departure.departure_date}"
        + (f" for a fee of {fee}." if fee else "."),
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
    # The fee is now owed through Ovigo; it becomes payable once the departure's
    # tour bookings complete (commissions/service.py::sync_guide_fee_status).
    await commissions_service.create_guide_fee_commissions(db, assignment)
    await commissions_service.sync_guide_fee_status(db, {assignment.tour_departure_id})
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


# --- Dates: a guide is never booked or assigned twice for the same day ---


def _span(departure_date: date, return_date: date | None, duration_days: int | None) -> list[date]:
    """Every day a departure runs: to its return date, or for the tour's length."""
    if return_date is not None and return_date >= departure_date:
        last = return_date
    else:
        last = departure_date + timedelta(days=max(duration_days or 1, 1) - 1)
    return [departure_date + timedelta(days=i) for i in range((last - departure_date).days + 1)]


def departure_dates(departure: TourDeparture) -> list[date]:
    """Needs `departure.tour` loaded."""
    return _span(departure.departure_date, departure.return_date, departure.tour.duration_days)


async def lock_guide(db: AsyncSession, guide_role_id: uuid.UUID) -> None:
    """Serializes everything that takes a guide's dates (assignments and direct
    bookings) — a row lock on the guide's role, held to the end of the transaction."""
    await db.execute(select(PartnerRole.id).where(PartnerRole.id == guide_role_id).with_for_update())


async def busy_dates(db: AsyncSession, guide_role_id: uuid.UUID, start: date, end: date) -> set[date]:
    """Days in [start, end] the guide is already committed: an active assignment's
    departure days, or a live direct booking's service date."""
    busy: set[date] = set()
    assignments = await db.execute(
        select(TourDeparture.departure_date, TourDeparture.return_date, Tour.duration_days)
        .join(GuideAssignment, GuideAssignment.tour_departure_id == TourDeparture.id)
        .join(Tour, Tour.id == TourDeparture.tour_id)
        .where(
            GuideAssignment.guide_role_id == guide_role_id,
            GuideAssignment.status.in_(_ACTIVE_ASSIGNMENT),
            TourDeparture.departure_date <= end,
            TourDeparture.departure_date >= start - timedelta(days=366),
        )
    )
    for departure_date, return_date, duration_days in assignments.all():
        busy.update(day for day in _span(departure_date, return_date, duration_days) if start <= day <= end)
    bookings = await db.execute(
        select(BookingItem.check_in_date)
        .join(GuideServicePackage, GuideServicePackage.id == BookingItem.guide_package_id)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .where(
            GuideServicePackage.guide_role_id == guide_role_id,
            BookingItem.item_type == BookingItemType.GUIDE_SERVICE,
            BookingItem.status != BookingItemStatus.CANCELLED,
            Booking.status != BookingStatus.CANCELLED,
            BookingItem.check_in_date >= start,
            BookingItem.check_in_date <= end,
        )
    )
    busy.update(d for d in bookings.scalars().all() if d is not None)
    return busy


async def assert_guide_free(db: AsyncSession, guide_role_id: uuid.UUID, days: list[date], *, require_open: bool) -> None:
    """Raises unless the guide can take all of `days`. A traveler can only book a
    day the guide has opened on their calendar (`require_open`, like a vehicle or
    room); an expert can assign any day the guide hasn't marked unavailable. Either
    way, a day already taken by another assignment or booking is refused."""
    rows = await db.execute(
        select(GuideAvailability).where(GuideAvailability.guide_role_id == guide_role_id, GuideAvailability.date.in_(days))
    )
    calendar = {row.date: row.is_available for row in rows.scalars().all()}
    for day in sorted(days):
        if calendar.get(day) is False:
            raise ConflictError(f"The guide isn't available on {day.isoformat()}")
        if require_open and day not in calendar:
            raise ConflictError(f"The guide hasn't opened {day.isoformat()} for bookings")
    taken = await busy_dates(db, guide_role_id, min(days), max(days))
    clash = sorted(set(days) & taken)
    if clash:
        raise ConflictError(f"The guide is already booked on {clash[0].isoformat()}")


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


# --- Certification & restriction (guide lifecycle, admin-managed) ---


async def _get_certification(db: AsyncSession, guide_role_id: uuid.UUID) -> GuideCertification | None:
    result = await db.execute(select(GuideCertification).where(GuideCertification.guide_role_id == guide_role_id))
    return result.scalar_one_or_none()


def _certification_dict(certification: GuideCertification | None) -> dict:
    if certification is None:
        return {
            "level": GuideCertificationLevel.NONE,
            "specialty": None,
            "is_restricted": False,
            "restriction_reason": None,
        }
    return {
        "level": certification.level,
        "specialty": certification.specialty,
        "is_restricted": certification.is_restricted,
        "restriction_reason": certification.restriction_reason,
    }


async def get_my_certification(db: AsyncSession, guide_role: PartnerRole) -> dict:
    return _certification_dict(await _get_certification(db, guide_role.id))


async def _get_or_create_certification(db: AsyncSession, guide_role_id: uuid.UUID) -> GuideCertification:
    certification = await _get_certification(db, guide_role_id)
    if certification is None:
        certification = GuideCertification(guide_role_id=guide_role_id)
        db.add(certification)
        await db.flush()
    return certification


async def admin_set_certification(
    db: AsyncSession, admin: User, guide_role_id: uuid.UUID, payload: GuideCertificationUpdate
) -> dict:
    certification = await _get_or_create_certification(db, guide_role_id)
    certification.level = payload.level
    certification.specialty = payload.specialty
    await audit.record(
        db,
        actor_id=admin.id,
        action="guide.certification_update",
        entity_type="partner_role",
        entity_id=guide_role_id,
        extra={"level": payload.level.value, "specialty": payload.specialty},
    )
    await db.commit()
    await db.refresh(certification)
    return _certification_dict(certification)


async def admin_set_restriction(
    db: AsyncSession, admin: User, guide_role_id: uuid.UUID, payload: GuideRestrictionUpdate
) -> dict:
    certification = await _get_or_create_certification(db, guide_role_id)
    certification.is_restricted = payload.is_restricted
    certification.restriction_reason = payload.restriction_reason
    await audit.record(
        db,
        actor_id=admin.id,
        action="guide.restriction_update",
        entity_type="partner_role",
        entity_id=guide_role_id,
        extra={"is_restricted": payload.is_restricted, "restriction_reason": payload.restriction_reason},
    )
    await db.commit()
    await db.refresh(certification)
    return _certification_dict(certification)


async def admin_list_guides(db: AsyncSession) -> list[dict]:
    roles_result = await db.execute(
        select(PartnerRole)
        .where(PartnerRole.role_type == PartnerRoleType.GUIDE)
        .options(selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user))
        .order_by(PartnerRole.created_at.desc())
    )
    roles = list(roles_result.scalars().all())

    certs_result = await db.execute(select(GuideCertification))
    certs_by_role = {c.guide_role_id: c for c in certs_result.scalars().all()}

    counts_result = await db.execute(
        select(GuideAssignment.guide_role_id, func.count())
        .where(GuideAssignment.status == AssignmentStatus.COMPLETED)
        .group_by(GuideAssignment.guide_role_id)
    )
    completed_counts = dict(counts_result.all())

    return [
        {
            "role": _person_summary(role),
            "role_status": role.status.value,
            "certification": _certification_dict(certs_by_role.get(role.id)),
            "total_completed_assignments": completed_counts.get(role.id, 0),
        }
        for role in roles
    ]


# --- Guide services (Phase 9.3): profile, packages, public listing, direct booking ---


async def _get_profile(db: AsyncSession, guide_role_id: uuid.UUID) -> GuideProfile | None:
    result = await db.execute(select(GuideProfile).where(GuideProfile.guide_role_id == guide_role_id))
    return result.scalar_one_or_none()


async def get_or_create_my_profile(db: AsyncSession, guide_role: PartnerRole) -> GuideProfile:
    profile = await _get_profile(db, guide_role.id)
    if profile is None:
        profile = GuideProfile(guide_role_id=guide_role.id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


async def update_my_profile(db: AsyncSession, guide_role: PartnerRole, payload: GuideProfileUpdate) -> GuideProfile:
    profile = await get_or_create_my_profile(db, guide_role)
    if profile.status == GuideProfileStatus.PENDING_REVIEW:
        raise ConflictError("Your profile is being reviewed — you can edit it again once it's approved or rejected")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


async def submit_my_profile(db: AsyncSession, guide_role: PartnerRole) -> GuideProfile:
    profile = await get_or_create_my_profile(db, guide_role)
    if profile.status not in (GuideProfileStatus.DRAFT, GuideProfileStatus.REJECTED):
        raise ConflictError(f"Your profile is {profile.status.value.replace('_', ' ')} — it can't be submitted again")
    if guide_role.status != PartnerRoleStatus.APPROVED:
        raise ConflictError("Your guide role needs Ovigo's approval before your profile can go public")
    if not (profile.headline and profile.city and profile.bio):
        raise ConflictError("Add a headline, your city and a short bio before submitting")
    if not await _active_packages(db, guide_role.id):
        raise ConflictError("Add at least one active package (e.g. Half day / Full day) before submitting")
    profile.status = GuideProfileStatus.PENDING_REVIEW
    profile.rejection_reason = None
    await db.commit()
    await db.refresh(profile)
    return profile


async def _active_packages(db: AsyncSession, guide_role_id: uuid.UUID) -> list[GuideServicePackage]:
    result = await db.execute(
        select(GuideServicePackage)
        .where(GuideServicePackage.guide_role_id == guide_role_id, GuideServicePackage.is_active.is_(True))
        .order_by(GuideServicePackage.price, GuideServicePackage.created_at)
    )
    return list(result.scalars().all())


async def list_my_packages(db: AsyncSession, guide_role: PartnerRole) -> list[GuideServicePackage]:
    result = await db.execute(
        select(GuideServicePackage)
        .where(GuideServicePackage.guide_role_id == guide_role.id)
        .order_by(GuideServicePackage.is_active.desc(), GuideServicePackage.price, GuideServicePackage.created_at)
    )
    return list(result.scalars().all())


async def create_package(db: AsyncSession, guide_role: PartnerRole, payload: GuidePackageCreate) -> GuideServicePackage:
    package = GuideServicePackage(guide_role_id=guide_role.id, **payload.model_dump())
    db.add(package)
    await db.commit()
    await db.refresh(package)
    return package


async def update_package(
    db: AsyncSession, guide_role: PartnerRole, package_id: uuid.UUID, payload: GuidePackageUpdate
) -> GuideServicePackage:
    """Prices are the guide's to change at any time; a booking or assignment already
    made keeps the price it was made at. Packages are hidden (is_active=False),
    never deleted, so past bookings still say what was bought."""
    package = (
        await db.execute(
            select(GuideServicePackage).where(
                GuideServicePackage.id == package_id, GuideServicePackage.guide_role_id == guide_role.id
            )
        )
    ).scalar_one_or_none()
    if package is None:
        raise NotFoundError("Package not found")
    updates = payload.model_dump(exclude_unset=True)
    for field in ("name", "price", "is_active"):
        if field in updates and updates[field] is None:
            raise AppError(f"{field} can't be empty", status_code=422)
    for field, value in updates.items():
        setattr(package, field, value)
    await db.commit()
    await db.refresh(package)
    return package


async def list_packages_for_expert(
    db: AsyncSession, expert_role: PartnerRole, guide_role_id: uuid.UUID
) -> list[GuideServicePackage]:
    """A supervising expert picks one of these when assigning the guide — whether or
    not the guide's public profile is live."""
    if await _active_supervision_for(db, expert_role.id, guide_role_id) is None:
        raise NotFoundError("This guide isn't one of your active guides")
    return await _active_packages(db, guide_role_id)


def _public_guide_filter():
    return (
        GuideProfile.status == GuideProfileStatus.PUBLISHED,
        PartnerRole.status == PartnerRoleStatus.APPROVED,
    )


async def _public_rows(db: AsyncSession, guide_role_id: uuid.UUID | None = None):
    query = (
        select(GuideProfile, User.full_name)
        .join(PartnerRole, PartnerRole.id == GuideProfile.guide_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .join(User, User.id == PartnerAccount.user_id)
        .where(*_public_guide_filter(), User.is_active.is_(True))
        .order_by(GuideProfile.updated_at.desc())
    )
    if guide_role_id is not None:
        query = query.where(GuideProfile.guide_role_id == guide_role_id)
    return (await db.execute(query)).all()


async def _public_summary(db: AsyncSession, profile: GuideProfile, full_name: str) -> dict | None:
    packages = await _active_packages(db, profile.guide_role_id)
    if not packages:
        return None
    certification = await _get_certification(db, profile.guide_role_id)
    return {
        "guide_role_id": profile.guide_role_id,
        "full_name": full_name,
        "headline": profile.headline,
        "city": profile.city,
        "languages": profile.languages or [],
        "years_experience": profile.years_experience,
        "certification_level": certification.level if certification else GuideCertificationLevel.NONE,
        "from_price": min(p.price for p in packages),
        "package_count": len(packages),
        "_packages": packages,
        "_bio": profile.bio,
    }


async def list_public_guides(db: AsyncSession, city: str | None = None, language: str | None = None) -> list[dict]:
    """Published guides with at least one active package, optionally narrowed by a
    case-insensitive city substring and/or a spoken language."""
    guides = []
    for profile, full_name in await _public_rows(db):
        if city and city.strip().lower() not in (profile.city or "").lower():
            continue
        if language and language.strip().lower() not in {l.lower() for l in (profile.languages or [])}:
            continue
        summary = await _public_summary(db, profile, full_name)
        if summary is not None:
            guides.append({k: v for k, v in summary.items() if not k.startswith("_")})
    return guides


async def get_public_guide(db: AsyncSession, guide_role_id: uuid.UUID) -> dict:
    rows = await _public_rows(db, guide_role_id)
    summary = await _public_summary(db, rows[0][0], rows[0][1]) if rows else None
    if summary is None:
        raise NotFoundError("Guide not found")
    completed = (
        await db.execute(
            select(func.count())
            .select_from(GuideAssignment)
            .where(GuideAssignment.guide_role_id == guide_role_id, GuideAssignment.status == AssignmentStatus.COMPLETED)
        )
    ).scalar_one()
    detail = {k: v for k, v in summary.items() if not k.startswith("_")}
    detail.update(bio=summary["_bio"], packages=summary["_packages"], completed_assignments=completed)
    return detail


async def public_open_dates(db: AsyncSession, guide_role_id: uuid.UUID, start: date, end: date) -> list[date]:
    """Days a traveler can book: opened by the guide, not taken, not in the past."""
    if not await _public_rows(db, guide_role_id):
        raise NotFoundError("Guide not found")
    start = max(start, date.today())
    if end < start:
        return []
    if (end - start).days > 120:
        raise AppError("Ask for at most 120 days at a time", status_code=422)
    result = await db.execute(
        select(GuideAvailability.date).where(
            GuideAvailability.guide_role_id == guide_role_id,
            GuideAvailability.is_available.is_(True),
            GuideAvailability.date >= start,
            GuideAvailability.date <= end,
        )
    )
    taken = await busy_dates(db, guide_role_id, start, end)
    return sorted(d for d in result.scalars().all() if d not in taken)


async def reserve_guide_service(db: AsyncSession, package_id: uuid.UUID, service_date: date) -> GuideServicePackage:
    """Called by bookings/service.py inside the booking transaction: checks the guide
    can take this date and holds it (the date stays taken while the booking item
    isn't cancelled — nothing to release on cancellation)."""
    package = (
        await db.execute(select(GuideServicePackage).where(GuideServicePackage.id == package_id))
    ).scalar_one_or_none()
    if package is None or not package.is_active:
        raise NotFoundError("This guide package isn't available")
    await lock_guide(db, package.guide_role_id)
    if not await _public_rows(db, package.guide_role_id):
        raise ConflictError("This guide isn't taking bookings right now")
    if service_date < date.today():
        raise ConflictError("Pick a date from today onwards")
    await assert_guide_free(db, package.guide_role_id, [service_date], require_open=True)
    return package


async def list_my_bookings(db: AsyncSession, guide_role: PartnerRole) -> list[dict]:
    """Paid bookings of this guide's packages (an unpaid one isn't a booking yet),
    soonest first, with who to meet."""
    rows = await db.execute(
        select(BookingItem, Booking.status, GuideServicePackage.name, User.full_name, User.email)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .join(GuideServicePackage, GuideServicePackage.id == BookingItem.guide_package_id)
        .join(User, User.id == Booking.user_id)
        .where(
            GuideServicePackage.guide_role_id == guide_role.id,
            BookingItem.item_type == BookingItemType.GUIDE_SERVICE,
            Booking.status != BookingStatus.PENDING_PAYMENT,
        )
        .order_by(BookingItem.check_in_date)
    )
    return [
        {
            "item_id": item.id,
            "booking_id": item.booking_id,
            "service_date": item.check_in_date,
            "package_name": package_name,
            "price": item.subtotal,
            "booking_status": booking_status.value,
            "item_status": item.status.value,
            "traveler_name": full_name,
            "traveler_email": email if booking_status != BookingStatus.CANCELLED else None,
        }
        for item, booking_status, package_name, full_name, email in rows.all()
    ]


async def notify_guides_of_booking(db: AsyncSession, booking: Booking) -> None:
    """Tells each guide in a just-confirmed booking that they've been booked."""
    for item in booking.items:
        if item.item_type != BookingItemType.GUIDE_SERVICE or item.guide_package_id is None:
            continue
        row = (
            await db.execute(
                select(PartnerAccount.user_id, GuideServicePackage.name)
                .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
                .join(GuideServicePackage, GuideServicePackage.guide_role_id == PartnerRole.id)
                .where(GuideServicePackage.id == item.guide_package_id)
            )
        ).one_or_none()
        if row is None:
            continue
        await notifications_service.notify(
            db,
            user_id=row.user_id,
            type=NotificationType.GUIDE_BOOKED,
            title="You've been booked",
            message=f"A traveler booked your \"{row.name}\" package for {item.check_in_date}.",
            link="/dashboard/guide",
        )


# --- Admin: guide profile review ---


async def _admin_profile_dict(db: AsyncSession, profile: GuideProfile) -> dict:
    role = (
        await db.execute(
            select(PartnerRole)
            .where(PartnerRole.id == profile.guide_role_id)
            .options(selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user))
        )
    ).scalar_one()
    packages = (
        await db.execute(
            select(GuideServicePackage)
            .where(GuideServicePackage.guide_role_id == profile.guide_role_id)
            .order_by(GuideServicePackage.price)
        )
    ).scalars().all()
    return {
        "guide": _person_summary(role),
        "role_status": role.status.value,
        "profile": profile,
        "packages": list(packages),
    }


async def admin_list_profiles(db: AsyncSession, status: GuideProfileStatus | None = None) -> list[dict]:
    query = select(GuideProfile).order_by(GuideProfile.updated_at.desc())
    if status is not None:
        query = query.where(GuideProfile.status == status)
    else:
        query = query.where(GuideProfile.status != GuideProfileStatus.DRAFT)
    return [await _admin_profile_dict(db, p) for p in (await db.execute(query)).scalars().all()]


async def _get_profile_or_404(db: AsyncSession, guide_role_id: uuid.UUID) -> GuideProfile:
    profile = await _get_profile(db, guide_role_id)
    if profile is None:
        raise NotFoundError("Guide profile not found")
    return profile


async def _moderate(
    db: AsyncSession,
    admin: User,
    guide_role_id: uuid.UUID,
    *,
    allowed_from: tuple[GuideProfileStatus, ...],
    to: GuideProfileStatus,
    action: str,
    reason: str | None,
    notify_type: NotificationType,
    title: str,
    message: str,
) -> dict:
    profile = await _get_profile_or_404(db, guide_role_id)
    if profile.status not in allowed_from:
        raise ConflictError(f"This profile is {profile.status.value.replace('_', ' ')}")
    profile.status = to
    profile.rejection_reason = reason
    user_id = await referrals_service._user_id_for_role(db, guide_role_id)
    if user_id is not None:
        await notifications_service.notify(
            db, user_id=user_id, type=notify_type, title=title, message=message, link="/dashboard/guide"
        )
    await audit.record(
        db, actor_id=admin.id, action=action, entity_type="guide_profile", entity_id=profile.id,
        extra={"reason": reason} if reason else None,
    )
    await db.commit()
    await db.refresh(profile)
    return await _admin_profile_dict(db, profile)


async def admin_approve_profile(db: AsyncSession, admin: User, guide_role_id: uuid.UUID) -> dict:
    return await _moderate(
        db, admin, guide_role_id,
        allowed_from=(GuideProfileStatus.PENDING_REVIEW,), to=GuideProfileStatus.PUBLISHED,
        action="guide_profile.approve", reason=None, notify_type=NotificationType.LISTING_APPROVED,
        title="Guide profile approved", message="Your guide profile is live — travelers can now book your packages.",
    )


async def admin_reject_profile(db: AsyncSession, admin: User, guide_role_id: uuid.UUID, reason: str) -> dict:
    return await _moderate(
        db, admin, guide_role_id,
        allowed_from=(GuideProfileStatus.PENDING_REVIEW,), to=GuideProfileStatus.REJECTED,
        action="guide_profile.reject", reason=reason, notify_type=NotificationType.LISTING_REJECTED,
        title="Guide profile not approved", message=f"Your guide profile wasn't approved: {reason}",
    )


async def admin_suspend_profile(db: AsyncSession, admin: User, guide_role_id: uuid.UUID, reason: str) -> dict:
    return await _moderate(
        db, admin, guide_role_id,
        allowed_from=(GuideProfileStatus.PUBLISHED,), to=GuideProfileStatus.SUSPENDED,
        action="guide_profile.suspend", reason=reason, notify_type=NotificationType.LISTING_REJECTED,
        title="Guide profile suspended", message=f"Your guide profile has been suspended: {reason}",
    )


async def admin_unsuspend_profile(db: AsyncSession, admin: User, guide_role_id: uuid.UUID) -> dict:
    return await _moderate(
        db, admin, guide_role_id,
        allowed_from=(GuideProfileStatus.SUSPENDED,), to=GuideProfileStatus.PUBLISHED,
        action="guide_profile.unsuspend", reason=None, notify_type=NotificationType.LISTING_APPROVED,
        title="Guide profile reinstated", message="Your guide profile is live again.",
    )
