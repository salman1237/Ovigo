from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.profiles.models import HostProfile, LocalExpertProfile
from app.modules.profiles.schemas import HostProfileUpsert, LocalExpertProfileUpsert
from app.modules.users.models import PartnerRole


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
