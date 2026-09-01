import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus
from app.modules.commissions.models import Commission, CommissionStatus
from app.modules.commissions.service import _partner_role_for_item
from app.modules.disputes.models import Dispute, DisputeResolution, DisputeStatus
from app.modules.disputes.schemas import DisputeCreate, DisputeResolve
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.payments.models import EscrowStatus, EscrowTransaction
from app.modules.users.models import PartnerAccount, PartnerRole, SystemRole, User

_EAGER = (selectinload(Dispute.raised_by), selectinload(Dispute.booking))


async def _user_id_for_partner_role(db: AsyncSession, role_id: uuid.UUID) -> uuid.UUID | None:
    result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == role_id)
    )
    return result.scalar_one_or_none()


async def _eligible_dispute_party_ids(db: AsyncSession, booking: Booking) -> set[uuid.UUID]:
    """Every user who is a legitimate party to this booking: the traveler, plus the
    owning user of whichever partner role serves each of its items. Used both to gate
    who may raise a dispute and to know who to notify when one opens or resolves."""
    party_ids = {booking.user_id}
    items_result = await db.execute(select(BookingItem).where(BookingItem.booking_id == booking.id))
    for item in items_result.scalars().all():
        partner_role_id = await _partner_role_for_item(db, item)
        if partner_role_id is None:
            continue
        owner_id = await _user_id_for_partner_role(db, partner_role_id)
        if owner_id is not None:
            party_ids.add(owner_id)
    return party_ids


async def _hold_commissions_for_booking(db: AsyncSession, booking_id: uuid.UUID) -> None:
    result = await db.execute(
        select(Commission)
        .join(BookingItem, Commission.booking_item_id == BookingItem.id)
        .where(
            BookingItem.booking_id == booking_id,
            Commission.status.in_([CommissionStatus.PENDING, CommissionStatus.PAYABLE]),
        )
    )
    for commission in result.scalars().all():
        commission.status = CommissionStatus.ON_HOLD


async def _release_commission_hold(db: AsyncSession, booking_id: uuid.UUID, *, cancel: bool) -> None:
    result = await db.execute(
        select(Commission, BookingItem.status)
        .join(BookingItem, Commission.booking_item_id == BookingItem.id)
        .where(BookingItem.booking_id == booking_id, Commission.status == CommissionStatus.ON_HOLD)
    )
    for commission, item_status in result.all():
        if cancel:
            commission.status = CommissionStatus.CANCELLED
        else:
            commission.status = (
                CommissionStatus.PAYABLE if item_status == BookingItemStatus.COMPLETED else CommissionStatus.PENDING
            )


async def create_dispute(db: AsyncSession, user: User, payload: DisputeCreate) -> Dispute:
    result = await db.execute(select(Booking).where(Booking.id == payload.booking_id))
    booking = result.scalar_one_or_none()
    if booking is None:
        raise NotFoundError("Booking not found")

    party_ids = await _eligible_dispute_party_ids(db, booking)
    if user.id not in party_ids:
        raise NotFoundError("Booking not found")

    existing = await db.execute(
        select(Dispute.id).where(Dispute.booking_id == booking.id, Dispute.status == DisputeStatus.OPEN)
    )
    if existing.scalar_one_or_none():
        raise ConflictError("There is already an open dispute for this booking")

    dispute = Dispute(booking_id=booking.id, raised_by_id=user.id, reason=payload.reason)
    db.add(dispute)
    await db.flush()  # populate dispute.id (client-side default) before it's used in notification links below
    await _hold_commissions_for_booking(db, booking.id)

    admins = await db.execute(select(User.id).where(User.system_role.in_([SystemRole.ADMIN, SystemRole.SUPER_ADMIN])))
    for admin_id in admins.scalars().all():
        await notifications_service.notify(
            db,
            user_id=admin_id,
            type=NotificationType.DISPUTE_OPENED,
            title="New dispute opened",
            message=f"{user.full_name} opened a dispute on booking {booking.id}.",
            link=f"/admin/disputes/{dispute.id}",
        )

    for party_id in party_ids - {user.id}:
        # Only the traveler has a booking-detail page to land on today — a partner
        # has no "bookings against my listings" view yet, so their notification is
        # informational only (no dead link).
        link = f"/bookings/{booking.id}" if party_id == booking.user_id else None
        await notifications_service.notify(
            db,
            user_id=party_id,
            type=NotificationType.DISPUTE_OPENED,
            title="A dispute was opened on your booking",
            message=f"{user.full_name} opened a dispute: {payload.reason[:150]}",
            link=link,
        )

    await db.commit()

    result = await db.execute(select(Dispute).where(Dispute.id == dispute.id).options(*_EAGER))
    return result.scalar_one()


async def list_my_disputes(db: AsyncSession, user: User) -> list[Dispute]:
    result = await db.execute(
        select(Dispute)
        .where(Dispute.raised_by_id == user.id)
        .options(*_EAGER)
        .order_by(Dispute.created_at.desc())
    )
    return list(result.scalars().all())


async def get_own_dispute_or_404(db: AsyncSession, user: User, dispute_id: uuid.UUID) -> Dispute:
    result = await db.execute(
        select(Dispute)
        .where(Dispute.id == dispute_id, Dispute.raised_by_id == user.id)
        .options(*_EAGER)
    )
    dispute = result.scalar_one_or_none()
    if dispute is None:
        raise NotFoundError("Dispute not found")
    return dispute


async def list_disputes(db: AsyncSession, status: DisputeStatus | None = None) -> list[Dispute]:
    query = select(Dispute).options(*_EAGER)
    if status is not None:
        query = query.where(Dispute.status == status)
    result = await db.execute(query.order_by(Dispute.created_at.desc()))
    return list(result.scalars().all())


async def _get_dispute_or_404(db: AsyncSession, dispute_id: uuid.UUID) -> Dispute:
    result = await db.execute(select(Dispute).where(Dispute.id == dispute_id).options(*_EAGER))
    dispute = result.scalar_one_or_none()
    if dispute is None:
        raise NotFoundError("Dispute not found")
    return dispute


async def resolve_dispute(db: AsyncSession, admin: User, dispute_id: uuid.UUID, payload: DisputeResolve) -> Dispute:
    dispute = await _get_dispute_or_404(db, dispute_id)
    if dispute.status != DisputeStatus.OPEN:
        raise ConflictError("This dispute has already been resolved")

    dispute.status = DisputeStatus.RESOLVED
    dispute.resolution = payload.resolution
    dispute.resolution_note = payload.note
    dispute.resolved_by_id = admin.id
    dispute.resolved_at = datetime.now(timezone.utc)

    if payload.resolution == DisputeResolution.REFUNDED:
        escrow_result = await db.execute(
            select(EscrowTransaction).where(EscrowTransaction.booking_id == dispute.booking_id).with_for_update()
        )
        escrow = escrow_result.scalar_one_or_none()
        if escrow is not None and escrow.status == EscrowStatus.HELD:
            escrow.status = EscrowStatus.REFUNDED
            escrow.released_at = datetime.now(timezone.utc)
        await _release_commission_hold(db, dispute.booking_id, cancel=True)
    else:
        await _release_commission_hold(db, dispute.booking_id, cancel=False)

    party_ids = await _eligible_dispute_party_ids(db, dispute.booking)
    for party_id in party_ids:
        link = f"/bookings/{dispute.booking_id}" if party_id == dispute.booking.user_id else None
        await notifications_service.notify(
            db,
            user_id=party_id,
            type=NotificationType.DISPUTE_RESOLVED,
            title="Dispute resolved",
            message=f"This dispute has been resolved ({payload.resolution.value}): {payload.note}",
            link=link,
        )

    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="dispute.resolve",
        entity_type="dispute",
        entity_id=dispute.id,
        extra={"resolution": payload.resolution.value, "booking_id": str(dispute.booking_id)},
    )
    return await _get_dispute_or_404(db, dispute_id)
