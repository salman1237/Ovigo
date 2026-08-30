import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.business_network.models import BusinessReferral, ReferralStatus
from app.modules.business_network.schemas import BusinessReferralCreate
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.users.models import PartnerAccount, PartnerRole, User

_EAGER = (
    selectinload(BusinessReferral.referring_expert_role)
    .selectinload(PartnerRole.partner_account)
    .selectinload(PartnerAccount.user),
)


async def create_referral(db: AsyncSession, expert_role: PartnerRole, payload: BusinessReferralCreate) -> BusinessReferral:
    referral = BusinessReferral(referring_expert_role_id=expert_role.id, **payload.model_dump())
    db.add(referral)
    await db.commit()
    result = await db.execute(select(BusinessReferral).where(BusinessReferral.id == referral.id).options(*_EAGER))
    return result.scalar_one()


async def list_my_referrals(db: AsyncSession, expert_role: PartnerRole) -> list[BusinessReferral]:
    result = await db.execute(
        select(BusinessReferral)
        .where(BusinessReferral.referring_expert_role_id == expert_role.id)
        .options(*_EAGER)
        .order_by(BusinessReferral.created_at.desc())
    )
    return list(result.scalars().all())


async def get_own_referral_or_404(db: AsyncSession, expert_role: PartnerRole, referral_id: uuid.UUID) -> BusinessReferral:
    result = await db.execute(
        select(BusinessReferral)
        .where(BusinessReferral.id == referral_id, BusinessReferral.referring_expert_role_id == expert_role.id)
        .options(*_EAGER)
    )
    referral = result.scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral not found")
    return referral


async def list_referrals(db: AsyncSession, status: ReferralStatus | None) -> list[BusinessReferral]:
    query = select(BusinessReferral).options(*_EAGER)
    if status is not None:
        query = query.where(BusinessReferral.status == status)
    result = await db.execute(query.order_by(BusinessReferral.created_at.desc()))
    return list(result.scalars().all())


async def _get_referral_or_404(db: AsyncSession, referral_id: uuid.UUID) -> BusinessReferral:
    result = await db.execute(select(BusinessReferral).where(BusinessReferral.id == referral_id).options(*_EAGER))
    referral = result.scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Referral not found")
    return referral


async def approve_referral(db: AsyncSession, admin: User, referral_id: uuid.UUID) -> BusinessReferral:
    referral = await _get_referral_or_404(db, referral_id)
    if referral.status != ReferralStatus.PENDING:
        raise ConflictError(f"Referral is {referral.status.value}, not pending")
    referral.status = ReferralStatus.APPROVED

    await notifications_service.notify(
        db,
        user_id=referral.referring_expert_role.partner_account.user_id,
        type=NotificationType.REFERRAL_APPROVED,
        title="Business referral approved",
        message=f'Your referral for "{referral.business_name}" has been approved.',
    )
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="business_referral.approve", entity_type="business_referral", entity_id=referral.id
    )
    return await _get_referral_or_404(db, referral_id)


async def reject_referral(db: AsyncSession, admin: User, referral_id: uuid.UUID, reason: str) -> BusinessReferral:
    referral = await _get_referral_or_404(db, referral_id)
    if referral.status != ReferralStatus.PENDING:
        raise ConflictError(f"Referral is {referral.status.value}, not pending")
    referral.status = ReferralStatus.REJECTED
    referral.rejection_reason = reason

    await notifications_service.notify(
        db,
        user_id=referral.referring_expert_role.partner_account.user_id,
        type=NotificationType.REFERRAL_REJECTED,
        title="Business referral rejected",
        message=f'Your referral for "{referral.business_name}" was rejected: {reason}',
    )
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="business_referral.reject",
        entity_type="business_referral",
        entity_id=referral.id,
        extra={"reason": reason},
    )
    return await _get_referral_or_404(db, referral_id)
