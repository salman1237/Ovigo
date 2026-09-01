import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.modules.badges.models import Badge, BadgeStatus, BadgeType
from app.modules.badges.schemas import BadgeApply
from app.modules.locations.models import TaggableEntityType
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.reviews.models import Review
from app.modules.stays.models import Property
from app.modules.tours.models import Tour
from app.modules.users.models import PartnerAccount, PartnerRole, User

# TOP_RATED thresholds — auto-awarded, never applied for manually.
_TOP_RATED_MIN_RATING = Decimal("4.5")
_TOP_RATED_MIN_REVIEWS = 5


async def _owner_user_id(db: AsyncSession, entity_type: TaggableEntityType, entity_id: uuid.UUID) -> uuid.UUID | None:
    if entity_type == TaggableEntityType.PARTNER_ROLE:
        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == entity_id)
        )
    elif entity_type == TaggableEntityType.TOUR:
        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .join(Tour, Tour.local_expert_role_id == PartnerRole.id)
            .where(Tour.id == entity_id)
        )
    elif entity_type == TaggableEntityType.PROPERTY:
        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .join(Property, Property.host_role_id == PartnerRole.id)
            .where(Property.id == entity_id)
        )
    else:
        return None
    return result.scalar_one_or_none()


async def _verify_ownership(db: AsyncSession, user: User, entity_type: TaggableEntityType, entity_id: uuid.UUID) -> None:
    owner_user_id = await _owner_user_id(db, entity_type, entity_id)
    if owner_user_id is None:
        raise NotFoundError("Entity not found")
    if owner_user_id != user.id:
        raise AppError("You don't own this listing", status_code=403)


async def apply_for_badge(db: AsyncSession, user: User, payload: BadgeApply) -> Badge:
    if payload.badge_type == BadgeType.TOP_RATED:
        raise ConflictError("Top-rated is auto-awarded based on reviews, not applied for")
    if payload.badge_type == BadgeType.COUPLE_FRIENDLY and payload.entity_type != TaggableEntityType.PROPERTY:
        raise ConflictError("The couple-friendly badge only applies to properties")

    await _verify_ownership(db, user, payload.entity_type, payload.entity_id)

    result = await db.execute(
        select(Badge).where(
            Badge.entity_type == payload.entity_type,
            Badge.entity_id == payload.entity_id,
            Badge.badge_type == payload.badge_type,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        if existing.status in (BadgeStatus.PENDING, BadgeStatus.APPROVED):
            raise ConflictError(f"A badge application already exists ({existing.status.value})")
        # a previously REJECTED application can be resubmitted
        existing.status = BadgeStatus.PENDING
        existing.private_note = payload.private_note
        existing.rejection_reason = None
        existing.applied_by_user_id = user.id
        await db.commit()
        await db.refresh(existing)
        return existing

    badge = Badge(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        badge_type=payload.badge_type,
        applied_by_user_id=user.id,
        private_note=payload.private_note,
    )
    db.add(badge)
    await db.commit()
    await db.refresh(badge)
    return badge


async def list_my_applications(db: AsyncSession, user: User) -> list[Badge]:
    result = await db.execute(
        select(Badge).where(Badge.applied_by_user_id == user.id).order_by(Badge.created_at.desc())
    )
    return list(result.scalars().all())


async def list_for_entity(db: AsyncSession, entity_type: TaggableEntityType, entity_id: uuid.UUID) -> list[Badge]:
    """Public: only APPROVED badges are ever shown for an entity."""
    result = await db.execute(
        select(Badge).where(
            Badge.entity_type == entity_type, Badge.entity_id == entity_id, Badge.status == BadgeStatus.APPROVED
        )
    )
    return list(result.scalars().all())


async def list_all(db: AsyncSession, status: BadgeStatus | None) -> list[Badge]:
    query = select(Badge)
    if status is not None:
        query = query.where(Badge.status == status)
    result = await db.execute(query.order_by(Badge.created_at.desc()))
    return list(result.scalars().all())


async def _get_badge_or_404(db: AsyncSession, badge_id: uuid.UUID) -> Badge:
    result = await db.execute(select(Badge).where(Badge.id == badge_id))
    badge = result.scalar_one_or_none()
    if badge is None:
        raise NotFoundError("Badge not found")
    return badge


async def approve_badge(db: AsyncSession, badge_id: uuid.UUID) -> Badge:
    badge = await _get_badge_or_404(db, badge_id)
    if badge.status != BadgeStatus.PENDING:
        raise ConflictError(f"Badge is {badge.status.value}, not pending")
    badge.status = BadgeStatus.APPROVED
    badge.awarded_at = datetime.now(timezone.utc)

    if badge.applied_by_user_id:
        await notifications_service.notify(
            db,
            user_id=badge.applied_by_user_id,
            type=NotificationType.BADGE_APPROVED,
            title="Badge approved",
            message=f"Your {badge.badge_type.value.replace('_', ' ')} badge application was approved.",
        )
    await db.commit()
    await db.refresh(badge)
    return badge


async def reject_badge(db: AsyncSession, badge_id: uuid.UUID, reason: str) -> Badge:
    badge = await _get_badge_or_404(db, badge_id)
    if badge.status != BadgeStatus.PENDING:
        raise ConflictError(f"Badge is {badge.status.value}, not pending")
    badge.status = BadgeStatus.REJECTED
    badge.rejection_reason = reason

    if badge.applied_by_user_id:
        await notifications_service.notify(
            db,
            user_id=badge.applied_by_user_id,
            type=NotificationType.BADGE_REJECTED,
            title="Badge rejected",
            message=f"Your {badge.badge_type.value.replace('_', ' ')} badge application was rejected: {reason}",
        )
    await db.commit()
    await db.refresh(badge)
    return badge


async def recompute_top_rated(db: AsyncSession, entity_type: TaggableEntityType, entity_id: uuid.UUID) -> None:
    """Called after every new review (reviews/service.py) — auto-awards or
    auto-revokes the TOP_RATED badge for one tour or property based on its
    current average rating. No admin step either way; this badge type is
    entirely computed, never applied for."""
    if entity_type == TaggableEntityType.TOUR:
        filter_col = Review.tour_id
    elif entity_type == TaggableEntityType.PROPERTY:
        filter_col = Review.property_id
    else:
        return

    result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(filter_col == entity_id)
    )
    avg_rating, review_count = result.one()

    existing_result = await db.execute(
        select(Badge).where(
            Badge.entity_type == entity_type, Badge.entity_id == entity_id, Badge.badge_type == BadgeType.TOP_RATED
        )
    )
    existing = existing_result.scalar_one_or_none()

    meets_threshold = (
        review_count is not None
        and review_count >= _TOP_RATED_MIN_REVIEWS
        and avg_rating is not None
        and Decimal(str(avg_rating)) >= _TOP_RATED_MIN_RATING
    )

    if meets_threshold and existing is None:
        db.add(
            Badge(
                entity_type=entity_type,
                entity_id=entity_id,
                badge_type=BadgeType.TOP_RATED,
                status=BadgeStatus.APPROVED,
                is_auto_awarded=True,
                awarded_at=datetime.now(timezone.utc),
            )
        )
        owner_user_id = await _owner_user_id(db, entity_type, entity_id)
        if owner_user_id:
            await notifications_service.notify(
                db,
                user_id=owner_user_id,
                type=NotificationType.BADGE_AUTO_AWARDED,
                title="Top Rated badge awarded!",
                message="Your consistently high ratings earned you the Top Rated badge.",
            )
    elif not meets_threshold and existing is not None and existing.is_auto_awarded:
        await db.delete(existing)

    await db.commit()
