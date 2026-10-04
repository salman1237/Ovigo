import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import storage
from app.core.exceptions import NotFoundError
from app.modules.locations.models import Location
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.guides.models import GuideProfile, GuideProfileStatus, GuideSupervision, SupervisionStatus
from app.modules.profiles import stats
from app.modules.profiles.models import HostProfile, LocalExpertProfile
from app.modules.profiles.schemas import (
    ExpertAssociatedGuide,
    ExpertAssociatedProperty,
    ExpertTransportService,
    ExpertUpcomingDeparture,
    HostProfileUpsert,
    LocalExpertProfileUpsert,
    PublicLocalExpertProfile,
)
from app.modules.stays.models import Property, PropertyStatus
from app.modules.tours.models import Tour, TourDeparture, TourStay, TourTransport
from app.modules.tours.schemas import TourExpertCard, TourSummary
from app.modules.tours.service import PUBLIC_TOUR_STATUSES
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


def _expert_photo_path(role_id: uuid.UUID, profile: LocalExpertProfile | None) -> str | None:
    """API-relative path; the frontend prefixes the API origin."""
    return f"/api/v1/partners/profiles/expert/{role_id}/photo/file" if profile and profile.has_photo else None


async def _approved_expert_role(db: AsyncSession, role_id: uuid.UUID) -> PartnerRole | None:
    result = await db.execute(
        select(PartnerRole)
        .where(
            PartnerRole.id == role_id,
            PartnerRole.role_type == PartnerRoleType.LOCAL_EXPERT,
            PartnerRole.status == PartnerRoleStatus.APPROVED,
        )
        .options(selectinload(PartnerRole.partner_account).selectinload(PartnerAccount.user))
    )
    return result.scalar_one_or_none()


async def _location_name(db: AsyncSession, location_id: uuid.UUID | None) -> str | None:
    if location_id is None:
        return None
    return (await db.execute(select(Location.name).where(Location.id == location_id))).scalar_one_or_none()


async def tour_expert_card(db: AsyncSession, role_id: uuid.UUID) -> TourExpertCard | None:
    """The "Your local expert" card on a public tour page — shown whether or not the
    expert has published their full profile (`profile_public` says whether to link it)."""
    role = await _approved_expert_role(db, role_id)
    if role is None:
        return None
    profile = (
        await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    ).scalar_one_or_none()
    track = await stats.expert_stats(db, role.id)
    return TourExpertCard(
        partner_role_id=role.id,
        name=role.partner_account.user.full_name,
        headline=profile.headline if profile else None,
        photo_url=_expert_photo_path(role.id, profile),
        years_experience=profile.years_experience if profile else None,
        languages=(profile.languages or []) if profile else [],
        primary_destination=await _location_name(db, profile.primary_destination_id if profile else None),
        profile_public=bool(profile and profile.is_published),
        identity_verified=await stats.identity_verified(db, role.id),
        member_since=role.approved_at,
        rating_avg=track.rating_avg,
        reviews_count=track.reviews_count,
        completed_bookings=track.completed_bookings,
        response_rate_percent=track.response_rate_percent,
        avg_response_minutes=track.avg_response_minutes,
    )


async def _upcoming_departures(db: AsyncSession, role_id: uuid.UUID, limit: int = 6) -> list[ExpertUpcomingDeparture]:
    rows = await db.execute(
        select(TourDeparture, Tour.title, Tour.base_price)
        .join(Tour, Tour.id == TourDeparture.tour_id)
        .where(
            Tour.local_expert_role_id == role_id,
            Tour.status.in_(PUBLIC_TOUR_STATUSES),
            TourDeparture.departure_date >= date.today(),
            TourDeparture.available_seats > 0,
            TourDeparture.status.notin_(["cancelled", "completed"]),
        )
        .order_by(TourDeparture.departure_date)
        .limit(limit)
    )
    return [
        ExpertUpcomingDeparture(
            departure_id=dep.id,
            tour_id=dep.tour_id,
            tour_title=title,
            departure_date=dep.departure_date,
            return_date=dep.return_date,
            available_seats=dep.available_seats,
            price=dep.price_override or base_price,
        )
        for dep, title, base_price in rows.all()
    ]


async def _associated_guides(db: AsyncSession, role_id: uuid.UUID) -> list[ExpertAssociatedGuide]:
    rows = await db.execute(
        select(GuideSupervision.guide_role_id, User.full_name, GuideProfile.status)
        .join(PartnerRole, PartnerRole.id == GuideSupervision.guide_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .join(User, User.id == PartnerAccount.user_id)
        .outerjoin(GuideProfile, GuideProfile.guide_role_id == GuideSupervision.guide_role_id)
        .where(
            GuideSupervision.local_expert_role_id == role_id,
            GuideSupervision.status == SupervisionStatus.ACCEPTED,
            PartnerRole.status == PartnerRoleStatus.APPROVED,
        )
        .order_by(User.full_name)
        .limit(12)
    )
    return [
        ExpertAssociatedGuide(guide_role_id=gid, name=name, has_public_profile=status == GuideProfileStatus.PUBLISHED)
        for gid, name, status in rows.all()
    ]


async def _associated_properties(db: AsyncSession, role_id: uuid.UUID) -> list[ExpertAssociatedProperty]:
    rows = await db.execute(
        select(Property.id, Property.name, Property.property_type)
        .join(TourStay, TourStay.property_id == Property.id)
        .join(Tour, Tour.id == TourStay.tour_id)
        .where(
            Tour.local_expert_role_id == role_id,
            Tour.status.in_(PUBLIC_TOUR_STATUSES),
            Property.status == PropertyStatus.PUBLISHED,
        )
        .distinct()
        .limit(12)
    )
    return [
        ExpertAssociatedProperty(property_id=pid, name=name, property_type=ptype.value) for pid, name, ptype in rows.all()
    ]


async def _transport_services(db: AsyncSession, role_id: uuid.UUID) -> list[ExpertTransportService]:
    rows = await db.execute(
        select(TourTransport.mode, TourTransport.provider_name, TourTransport.vehicle_type)
        .join(Tour, Tour.id == TourTransport.tour_id)
        .where(Tour.local_expert_role_id == role_id, Tour.status.in_(PUBLIC_TOUR_STATUSES))
        .distinct()
        .limit(8)
    )
    return [ExpertTransportService(mode=m, provider_name=p, vehicle_type=v) for m, p, v in rows.all()]


async def get_public_expert_profile(db: AsyncSession, role_id: uuid.UUID) -> PublicLocalExpertProfile:
    role = await _approved_expert_role(db, role_id)
    if role is None:
        raise NotFoundError("Local expert not found")
    profile = (
        await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    ).scalar_one_or_none()
    if profile is None or not profile.is_published:
        raise NotFoundError("Local expert profile is not published")

    t_res = await db.execute(
        select(Tour)
        .where(Tour.local_expert_role_id == role.id, Tour.status.in_(PUBLIC_TOUR_STATUSES))
        .options(selectinload(Tour.images))
        .order_by(Tour.created_at.desc())
    )
    tours = [TourSummary.model_validate(t) for t in t_res.scalars().all()]
    track = await stats.expert_stats(db, role.id)
    verified = await stats.identity_verified(db, role.id)

    return PublicLocalExpertProfile(
        partner_role_id=role.id,
        name=role.partner_account.user.full_name,
        headline=profile.headline,
        bio=profile.bio,
        years_experience=profile.years_experience,
        languages=profile.languages or [],
        has_photo=profile.has_photo,
        photo_url=_expert_photo_path(role.id, profile),
        primary_destination=await _location_name(db, profile.primary_destination_id),
        secondary_destinations=profile.secondary_destinations or [],
        expertise_categories=profile.expertise_categories or [],
        security_verification_status="verified" if verified else "pending",
        identity_verified=verified,
        member_since=role.approved_at,
        emergency_handling_capability=profile.emergency_handling_capability,
        rating_avg=track.rating_avg,
        reviews_count=track.reviews_count,
        rating_breakdown=track.rating_breakdown,
        total_tours_conducted=track.successful_tours,
        completed_bookings=track.completed_bookings,
        response_rate_percent=track.response_rate_percent,
        avg_response_minutes=track.avg_response_minutes,
        completion_rate_percent=track.completion_rate_percent,
        cancellation_rate_percent=track.cancellation_rate_percent,
        tours=tours,
        upcoming_departures=await _upcoming_departures(db, role.id),
        guides=await _associated_guides(db, role.id),
        properties=await _associated_properties(db, role.id),
        transport=await _transport_services(db, role.id),
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
            link="/admin/partners",
        )
    await db.commit()
