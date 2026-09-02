import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.notifications.models import CampaignAudience, Notification, NotificationCampaign, NotificationTemplate, NotificationType
from app.modules.notifications.schemas import CampaignCreate, TemplateCreate, TemplateUpdate
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, User


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type: NotificationType,
    title: str,
    message: str,
    link: str | None = None,
) -> None:
    """Create an in-app notification. Doesn't commit — callers already have an open
    transaction for the event that triggered this (a booking status change, a role
    approval, ...) and this should land in the same commit, not a separate one.

    Email/SMS delivery would be added here once a provider is configured — see
    module docstring.
    """
    db.add(Notification(user_id=user_id, type=type, title=title, message=message, link=link))


async def list_for_user(db: AsyncSession, user_id: uuid.UUID, unread_only: bool = False) -> list[Notification]:
    query = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    result = await db.execute(query.order_by(Notification.created_at.desc()).limit(100))
    return list(result.scalars().all())


async def unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == user_id, Notification.is_read.is_(False))
    )
    return result.scalar_one()


async def mark_read(db: AsyncSession, user_id: uuid.UUID, notification_id: uuid.UUID) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user_id)
        .values(is_read=True)
    )
    await db.commit()


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(update(Notification).where(Notification.user_id == user_id).values(is_read=True))
    await db.commit()


async def create_template(db: AsyncSession, payload: TemplateCreate) -> NotificationTemplate:
    template = NotificationTemplate(**payload.model_dump())
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def list_templates(db: AsyncSession) -> list[NotificationTemplate]:
    result = await db.execute(select(NotificationTemplate).order_by(NotificationTemplate.created_at.desc()))
    return list(result.scalars().all())


async def _get_template_or_404(db: AsyncSession, template_id: uuid.UUID) -> NotificationTemplate:
    result = await db.execute(select(NotificationTemplate).where(NotificationTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if template is None:
        raise NotFoundError("Template not found")
    return template


async def update_template(db: AsyncSession, template_id: uuid.UUID, payload: TemplateUpdate) -> NotificationTemplate:
    template = await _get_template_or_404(db, template_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    await db.commit()
    await db.refresh(template)
    return template


async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> None:
    template = await _get_template_or_404(db, template_id)
    await db.delete(template)
    await db.commit()


async def _resolve_audience_user_ids(
    db: AsyncSession, audience: CampaignAudience, role_type: str | None
) -> list[uuid.UUID]:
    if audience == CampaignAudience.ALL_USERS:
        result = await db.execute(select(User.id))
        return list(result.scalars().all())

    if audience == CampaignAudience.TRAVELERS_ONLY:
        result = await db.execute(
            select(User.id)
            .outerjoin(PartnerAccount, PartnerAccount.user_id == User.id)
            .where(PartnerAccount.id.is_(None))
        )
        return list(result.scalars().all())

    # PARTNERS_ONLY
    query = select(User.id).join(PartnerAccount, PartnerAccount.user_id == User.id)
    if role_type is not None:
        query = query.join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id).where(
            PartnerRole.role_type == role_type, PartnerRole.status == PartnerRoleStatus.APPROVED
        )
    result = await db.execute(query.distinct())
    return list(result.scalars().all())


async def send_campaign(db: AsyncSession, admin: User, payload: CampaignCreate) -> NotificationCampaign:
    """Every recipient gets the same in-app Notification, written in this one
    transaction — see module docstring for why there's no queued/background send
    and no real push/SMS/email delivery yet."""
    title, message = payload.title, payload.message
    if payload.template_id is not None:
        template = await _get_template_or_404(db, payload.template_id)
        title, message = title or template.subject, message or template.body

    role_type_value = payload.audience_role_type.value if payload.audience_role_type else None
    recipient_ids = await _resolve_audience_user_ids(db, payload.audience, role_type_value)

    for user_id in recipient_ids:
        await notify(db, user_id=user_id, type=NotificationType.ADMIN_ANNOUNCEMENT, title=title, message=message)

    campaign = NotificationCampaign(
        template_id=payload.template_id,
        title=title,
        message=message,
        audience=payload.audience,
        audience_role_type=role_type_value,
        is_urgent=payload.is_urgent,
        recipient_count=len(recipient_ids),
        sent_by_id=admin.id,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def list_campaigns(db: AsyncSession) -> list[NotificationCampaign]:
    result = await db.execute(select(NotificationCampaign).order_by(NotificationCampaign.created_at.desc()))
    return list(result.scalars().all())
