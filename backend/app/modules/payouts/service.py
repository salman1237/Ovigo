import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.modules.commissions.models import Commission, CommissionStatus
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.payouts.models import Payout
from app.modules.payouts.schemas import PayoutPreviewRow
from app.modules.users.models import PartnerAccount, PartnerRole, User


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
    Payout row per partner, marks those commissions PAID, and notifies each partner.
    Idempotent in the sense that running it again with nothing PAYABLE creates nothing."""
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
            title="Payout processed",
            message=f"A payout of {total} covering {len(commissions)} commission(s) has been processed.",
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


async def list_payouts_for_role(db: AsyncSession, role: PartnerRole) -> list[Payout]:
    result = await db.execute(
        select(Payout).where(Payout.partner_role_id == role.id).order_by(Payout.created_at.desc())
    )
    return list(result.scalars().all())


async def list_all_payouts(db: AsyncSession) -> list[Payout]:
    result = await db.execute(select(Payout).order_by(Payout.created_at.desc()))
    return list(result.scalars().all())
