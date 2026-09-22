import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.commissions.models import Commission, CommissionStatus
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.payouts.models import Payout, PayoutStatus
from app.modules.payouts.schemas import PayoutPreviewRow, PayoutStatusUpdate
from app.modules.users.models import PartnerAccount, PartnerRole, User

# A payout only ever moves forward. FAILED and REVERSED are both terminal — the
# money never stayed with the partner either way, so recovery is a fresh batch
# picking up the commissions this transition reverts, not resurrecting this row.
_ALLOWED_TRANSITIONS: dict[PayoutStatus, set[PayoutStatus]] = {
    PayoutStatus.PENDING: {PayoutStatus.PROCESSING, PayoutStatus.FAILED},
    PayoutStatus.PROCESSING: {PayoutStatus.PAID, PayoutStatus.FAILED},
    PayoutStatus.PAID: {PayoutStatus.REVERSED},
    PayoutStatus.FAILED: set(),
    PayoutStatus.REVERSED: set(),
}


async def _payable_by_partner(db: AsyncSession) -> dict[uuid.UUID, list[Commission]]:
    result = await db.execute(select(Commission).where(Commission.status == CommissionStatus.PAYABLE))
    grouped: dict[uuid.UUID, list[Commission]] = defaultdict(list)
    for commission in result.scalars().all():
        grouped[commission.partner_role_id].append(commission)
    return grouped


async def preview_payouts(db: AsyncSession) -> list[PayoutPreviewRow]:
    """Automated payout split calculation: shows what a batch run would pay out,
    per partner, without creating anything or mutating any commission row."""
    grouped = await _payable_by_partner(db)
    rows = []
    for partner_role_id, commissions in grouped.items():
        result = await db.execute(
            select(PartnerRole)
            .where(PartnerRole.id == partner_role_id)
            .options(selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user))
        )
        role = result.scalar_one()
        total = sum((c.partner_net_amount for c in commissions), Decimal("0"))
        rows.append(
            PayoutPreviewRow(
                partner_role_id=partner_role_id,
                partner_name=role.partner_account.user.full_name,
                commission_count=len(commissions),
                total_amount=total,
            )
        )
    return rows


async def run_payout_batch(db: AsyncSession, admin: User) -> list[Payout]:
    """Batch payout processing: sweeps every currently-PAYABLE commission into one
    PENDING Payout row per partner, marks those commissions PAID, and notifies each
    partner that a payout has been prepared. Idempotent in the sense that running it
    again with nothing PAYABLE creates nothing. The payout still has to be walked
    through PROCESSING -> PAID (or FAILED/REVERSED) by an admin via update_payout_status
    once the transfer has actually been sent — see the module docstring."""
    grouped = await _payable_by_partner(db)
    payouts = []
    for partner_role_id, commissions in grouped.items():
        total = sum((c.partner_net_amount for c in commissions), Decimal("0"))
        payout = Payout(partner_role_id=partner_role_id, total_amount=total, commission_count=len(commissions))
        db.add(payout)
        await db.flush()

        for commission in commissions:
            commission.status = CommissionStatus.PAID
            commission.payout_id = payout.id

        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == partner_role_id)
        )
        user_id = result.scalar_one()
        await notifications_service.notify(
            db,
            user_id=user_id,
            type=NotificationType.PAYOUT_PROCESSED,
            title="Payout prepared",
            message=f"A payout of {total} covering {len(commissions)} commission(s) has been prepared and is being processed.",
            link="/dashboard/earnings",
        )
        await audit.record(
            db,
            actor_id=admin.id,
            action="payout.run",
            entity_type="payout",
            entity_id=payout.id,
            extra={"partner_role_id": str(partner_role_id), "total_amount": str(total), "commission_count": len(commissions)},
        )
        payouts.append(payout)

    await db.commit()
    for payout in payouts:
        await db.refresh(payout)
    return payouts


async def update_payout_status(db: AsyncSession, admin: User, payout_id: uuid.UUID, payload: PayoutStatusUpdate) -> Payout:
    """Walks a payout forward through its lifecycle. FAILED/REVERSED both mean the
    partner never actually kept the money, so this reverts every commission this
    payout carried back to PAYABLE (and detaches it from this payout row) so the
    next batch run picks them back up instead of them being stranded as PAID."""
    result = await db.execute(select(Payout).where(Payout.id == payout_id))
    payout = result.scalar_one_or_none()
    if payout is None:
        raise NotFoundError("Payout not found")

    if payload.status not in _ALLOWED_TRANSITIONS[payout.status]:
        raise ConflictError(f"Cannot move a payout from {payout.status.value} to {payload.status.value}")

    from_status = payout.status
    payout.status = payload.status
    if payload.reference is not None:
        payout.reference = payload.reference
    if payload.note is not None:
        payout.note = payload.note

    result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == payout.partner_role_id)
    )
    user_id = result.scalar_one()

    if payload.status == PayoutStatus.PAID:
        payout.paid_at = datetime.now(timezone.utc)
        await notifications_service.notify(
            db,
            user_id=user_id,
            type=NotificationType.PAYOUT_PROCESSED,
            title="Payout paid",
            message=f"Your payout of {payout.total_amount} has been confirmed as paid.",
            link="/dashboard/earnings",
        )
    elif payload.status in (PayoutStatus.FAILED, PayoutStatus.REVERSED):
        commissions_result = await db.execute(select(Commission).where(Commission.payout_id == payout.id))
        for commission in commissions_result.scalars().all():
            commission.status = CommissionStatus.PAYABLE
            commission.payout_id = None
        verb = "failed" if payload.status == PayoutStatus.FAILED else "was reversed"
        await notifications_service.notify(
            db,
            user_id=user_id,
            type=NotificationType.PAYOUT_FAILED,
            title="Payout issue",
            message=f"Your payout of {payout.total_amount} {verb} and will be included in the next payout batch.",
            link="/dashboard/earnings",
        )

    await audit.record(
        db,
        actor_id=admin.id,
        action="payout.status_update",
        entity_type="payout",
        entity_id=payout.id,
        extra={"from_status": from_status.value, "to_status": payload.status.value, "reference": payload.reference, "note": payload.note},
    )

    await db.commit()
    await db.refresh(payout)
    return payout


async def list_payouts_for_role(db: AsyncSession, role: PartnerRole) -> list[Payout]:
    result = await db.execute(
        select(Payout).where(Payout.partner_role_id == role.id).order_by(Payout.created_at.desc())
    )
    return list(result.scalars().all())


async def list_all_payouts(db: AsyncSession) -> list[Payout]:
    result = await db.execute(select(Payout).order_by(Payout.created_at.desc()))
    return list(result.scalars().all())
