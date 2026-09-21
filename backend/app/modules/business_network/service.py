import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.exceptions import ConflictError, NotFoundError
from app.modules.business_network.models import BusinessReferral, OwnershipType, ReferralStatus
from app.modules.business_network.schemas import BusinessReferralCreate
from app.modules.fraud import service as fraud_service
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.users.models import PartnerAccount, PartnerRole, User

_EAGER = (
    selectinload(BusinessReferral.referring_expert_role)
    .selectinload(PartnerRole.partner_account)
    .selectinload(PartnerAccount.user),
)


async def _check_duplicate(db: AsyncSession, business_name: str, contact_phone: str | None, contact_email: str | None) -> None:
    """A business already referred (and not rejected) blocks a second submission —
    same name, or same phone/email, both strong signals of the same business
    being submitted twice (by the same or a different expert)."""
    conditions = [func.lower(BusinessReferral.business_name) == business_name.strip().lower()]
    if contact_phone:
        conditions.append(BusinessReferral.contact_phone == contact_phone)
    if contact_email:
        conditions.append(BusinessReferral.contact_email == contact_email)
    result = await db.execute(
        select(BusinessReferral.business_name).where(
            BusinessReferral.status != ReferralStatus.REJECTED, or_(*conditions)
        )
    )
    existing_name = result.scalar_one_or_none()
    if existing_name is not None:
        raise ConflictError(f'A business matching "{existing_name}" has already been referred')


async def create_referral(db: AsyncSession, expert_role: PartnerRole, payload: BusinessReferralCreate) -> BusinessReferral:
    await _check_duplicate(db, payload.business_name, payload.contact_phone, payload.contact_email)
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


async def link_partner(db: AsyncSession, admin: User, referral_id: uuid.UUID, partner_role_id: uuid.UUID) -> BusinessReferral:
    """Admin action once the referred business itself signs up as an actual Ovigo
    partner — from this point on, commissions/service.py credits the referring
    expert a NETWORK-scope cut whenever the linked partner earns a DIRECT commission."""
    referral = await _get_referral_or_404(db, referral_id)
    if referral.status != ReferralStatus.APPROVED:
        raise ConflictError("Only an approved referral can be linked to a partner")
    referral.linked_partner_role_id = partner_role_id
    await db.commit()
    await fraud_service.check_self_referral(db, referral.referring_expert_role_id, partner_role_id, referral.id)
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="business_referral.link_partner",
        entity_type="business_referral",
        entity_id=referral.id,
        extra={"partner_role_id": str(partner_role_id)},
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


async def send_invite(db: AsyncSession, expert_role: PartnerRole, referral_id: uuid.UUID) -> BusinessReferral:
    """The referring expert generates a shareable claim link for the actual business
    owner — only meaningful for a REFERRED (not OWNED) referral, and only once an
    admin has approved it as a legitimate submission."""
    referral = await get_own_referral_or_404(db, expert_role, referral_id)
    if referral.ownership_type != OwnershipType.REFERRED:
        raise ConflictError("Only a referred (not owned) business needs an owner invite")
    if referral.status != ReferralStatus.APPROVED:
        raise ConflictError(f"Referral is {referral.status.value} — can only invite the owner of an approved referral")
    referral.invite_token = secrets.token_urlsafe(24)
    referral.invite_sent_at = datetime.now(timezone.utc)
    await db.commit()
    return await get_own_referral_or_404(db, expert_role, referral_id)


async def _get_referral_by_token(db: AsyncSession, token: str) -> BusinessReferral:
    result = await db.execute(select(BusinessReferral).where(BusinessReferral.invite_token == token).options(*_EAGER))
    referral = result.scalar_one_or_none()
    if referral is None:
        raise NotFoundError("Invite link not found or expired")
    return referral


async def get_claim_info(db: AsyncSession, token: str) -> BusinessReferral:
    return await _get_referral_by_token(db, token)


async def claim_referral(db: AsyncSession, user: User, token: str) -> BusinessReferral:
    referral = await _get_referral_by_token(db, token)
    if referral.invited_user_id is not None and referral.invited_user_id != user.id:
        raise ConflictError("This invite has already been claimed by someone else")
    if referral.invited_user_id == user.id:
        return referral  # already claimed by this same user — idempotent

    referral.invited_user_id = user.id
    referral.invite_accepted_at = datetime.now(timezone.utc)
    await db.commit()

    referring_user_id = referral.referring_expert_role.partner_account.user_id
    await notifications_service.notify(
        db,
        user_id=referring_user_id,
        type=NotificationType.REFERRAL_APPROVED,
        title="Your referral was claimed",
        message=f'{user.full_name} claimed the invite for "{referral.business_name}" — they can now apply as a partner.',
    )
    await db.commit()
    return await _get_referral_by_token(db, token)


async def verify_business(db: AsyncSession, admin: User, referral_id: uuid.UUID, verified: bool) -> BusinessReferral:
    """A step distinct from status approval — an admin independently confirming the
    business itself is real, not just that the referral record looks legitimate."""
    referral = await _get_referral_or_404(db, referral_id)
    referral.is_business_verified = verified
    referral.verified_at = datetime.now(timezone.utc) if verified else None
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="business_referral.verify" if verified else "business_referral.unverify",
        entity_type="business_referral",
        entity_id=referral.id,
    )
    return await _get_referral_or_404(db, referral_id)


async def set_commission_rate(db: AsyncSession, admin: User, referral_id: uuid.UUID, rate: Decimal | None) -> BusinessReferral:
    """A negotiated commission rate for this specific referral, overriding the
    platform-wide NETWORK rate (commissions/service.py::_resolve_network_rate)."""
    referral = await _get_referral_or_404(db, referral_id)
    referral.custom_commission_rate = rate
    await db.commit()
    await audit.record(
        db,
        actor_id=admin.id,
        action="business_referral.set_commission_rate",
        entity_type="business_referral",
        entity_id=referral.id,
        extra={"rate": str(rate) if rate is not None else None},
    )
    return await _get_referral_or_404(db, referral_id)
