import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
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
