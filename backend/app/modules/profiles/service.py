import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import storage
from app.core.exceptions import NotFoundError
from app.modules.locations.models import Location
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.profiles.models import HostProfile, LocalExpertProfile
from app.modules.profiles.schemas import HostProfileUpsert, LocalExpertProfileUpsert, PublicLocalExpertProfile
from app.modules.tours.models import Tour, TourStatus
from app.modules.tours.schemas import TourSummary
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, PartnerRoleType, SystemRole, User


async def get_expert_profile(db: AsyncSession, role: PartnerRole) -> LocalExpertProfile:
    result = await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise NotFoundError("No expert profile yet — create one with PUT")
    return profile


async def upsert_expert_profile(
    db: AsyncSession, role: PartnerRole, payload: LocalExpertProfileUpsert
) -> LocalExpertProfile:
    result = await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = LocalExpertProfile(partner_role_id=role.id)
        db.add(profile)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


async def get_host_profile(db: AsyncSession, role: PartnerRole) -> HostProfile:
    result = await db.execute(select(HostProfile).where(HostProfile.partner_role_id == role.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise NotFoundError("No host profile yet — create one with PUT")
    return profile


async def upsert_host_profile(db: AsyncSession, role: PartnerRole, payload: HostProfileUpsert) -> HostProfile:
    result = await db.execute(select(HostProfile).where(HostProfile.partner_role_id == role.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = HostProfile(partner_role_id=role.id)
        db.add(profile)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return profile


async def set_expert_photo(
    db: AsyncSession, role: PartnerRole, file_name: str, content_type: str, data: bytes
) -> LocalExpertProfile:
    storage.validate_image(content_type, len(data))
    result = await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = LocalExpertProfile(partner_role_id=role.id)
        db.add(profile)
        await db.flush()

    old_key = profile.photo_key
    profile.photo_key = storage.build_key(f"profiles/expert/{role.id}", file_name)
    profile.photo_content_type = content_type
    storage.upload_bytes(profile.photo_key, data, content_type)
    if old_key:
        storage.delete_object(old_key)

    await db.commit()
    await db.refresh(profile)
    return profile


async def set_host_photo(db: AsyncSession, role: PartnerRole, file_name: str, content_type: str, data: bytes) -> HostProfile:
    storage.validate_image(content_type, len(data))
    result = await db.execute(select(HostProfile).where(HostProfile.partner_role_id == role.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = HostProfile(partner_role_id=role.id)
        db.add(profile)
        await db.flush()

    old_key = profile.photo_key
    profile.photo_key = storage.build_key(f"profiles/host/{role.id}", file_name)
    profile.photo_content_type = content_type
    storage.upload_bytes(profile.photo_key, data, content_type)
    if old_key:
        storage.delete_object(old_key)

    await db.commit()
    await db.refresh(profile)
    return profile


async def get_expert_photo(db: AsyncSession, role_id: uuid.UUID) -> tuple[str, str]:
    result = await db.execute(
        select(LocalExpertProfile.photo_key, LocalExpertProfile.photo_content_type).where(
            LocalExpertProfile.partner_role_id == role_id
        )
    )
    row = result.one_or_none()
    if row is None or not row[0]:
        raise NotFoundError("No photo set for this expert")
    return row[0], row[1] or "application/octet-stream"


async def get_host_photo(db: AsyncSession, role_id: uuid.UUID) -> tuple[str, str]:
    result = await db.execute(
        select(HostProfile.photo_key, HostProfile.photo_content_type).where(HostProfile.partner_role_id == role_id)
    )
    row = result.one_or_none()
    if row is None or not row[0]:
        raise NotFoundError("No photo set for this host")
    return row[0], row[1] or "application/octet-stream"


async def get_public_expert_profile(db: AsyncSession, role_id: uuid.UUID) -> PublicLocalExpertProfile:
    result = await db.execute(
        select(PartnerRole)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .join(User, PartnerAccount.user_id == User.id)
        .where(
            PartnerRole.id == role_id,
            PartnerRole.role_type == PartnerRoleType.LOCAL_EXPERT,
            PartnerRole.status == PartnerRoleStatus.APPROVED,
        )
        .options(selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user))
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise NotFoundError("Local expert not found")

    user = role.partner_account.user

    p_res = await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    profile = p_res.scalar_one_or_none()
    if profile is None or not profile.is_published:
        raise NotFoundError("Local expert profile is not published")

    t_res = await db.execute(
        select(Tour)
        .where(
            Tour.local_expert_role_id == role.id,
            Tour.status.in_([
                TourStatus.PUBLISHED,
                TourStatus.BOOKING_OPEN,
                TourStatus.ALMOST_FULL,
                TourStatus.SCHEDULED,
            ]),
        )
        .options(selectinload(Tour.images))
        .order_by(Tour.created_at.desc())
    )
    tours = [TourSummary.model_validate(t) for t in t_res.scalars().all()]

    primary_dest_name = None
    if profile.primary_destination_id:
        loc_res = await db.execute(select(Location.name).where(Location.id == profile.primary_destination_id))
        primary_dest_name = loc_res.scalar_one_or_none()

    photo_url = f"/api/v1/partners/profiles/expert/{role.id}/photo/file" if profile.has_photo else None

    return PublicLocalExpertProfile(
        partner_role_id=role.id,
        name=user.full_name,
        headline=profile.headline,
        bio=profile.bio,
        years_experience=profile.years_experience,
        languages=profile.languages or [],
        has_photo=profile.has_photo,
        photo_url=photo_url,
        primary_destination=primary_dest_name,
        secondary_destinations=profile.secondary_destinations or [],
        expertise_categories=profile.expertise_categories or [],
        security_verification_status=profile.security_verification_status,
        emergency_handling_capability=profile.emergency_handling_capability,
        rating_avg=profile.rating_avg,
        reviews_count=profile.reviews_count,
        total_tours_conducted=profile.total_tours_conducted,
        response_rate_percent=profile.response_rate_percent,
        completion_rate_percent=profile.completion_rate_percent,
        cancellation_rate_percent=profile.cancellation_rate_percent,
        badge_level=profile.badge_level,
        tours=tours,
    )


async def report_expert_profile(db: AsyncSession, reporter: User, role_id: uuid.UUID, reason: str) -> None:
    """PRD 8.2's "Report-profile button" — notifies every admin directly rather
    than persisting a dedicated reports queue, since the PRD doesn't describe
    a reports-triage workflow the way it does for disputes (disputes/service.py's
    _notify admin broadcast is the pattern this mirrors)."""
    result = await db.execute(
        select(PartnerRole).where(PartnerRole.id == role_id, PartnerRole.role_type == PartnerRoleType.LOCAL_EXPERT)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise NotFoundError("Local expert not found")

    admins = await db.execute(select(User.id).where(User.system_role.in_([SystemRole.ADMIN, SystemRole.SUPER_ADMIN])))
    for admin_id in admins.scalars().all():
        await notifications_service.notify(
            db,
            user_id=admin_id,
            type=NotificationType.PROFILE_REPORTED,
            title="Local Expert profile reported",
            message=f"{reporter.full_name} reported a Local Expert profile: {reason}",
            link=f"/admin/partners",
        )
    await db.commit()
