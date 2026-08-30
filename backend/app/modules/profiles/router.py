import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.profiles import service
from app.modules.profiles.schemas import (
    HostProfileRead,
    HostProfileUpsert,
    LocalExpertProfileRead,
    LocalExpertProfileUpsert,
)
from app.modules.users.models import PartnerRole, PartnerRoleType

router = APIRouter(prefix="/api/v1/partners/profiles", tags=["profiles"])

require_expert = require_approved_role(PartnerRoleType.LOCAL_EXPERT)
require_host = require_approved_role(PartnerRoleType.HOST, PartnerRoleType.HOTEL)


@router.get("/expert", response_model=LocalExpertProfileRead)
async def get_my_expert_profile(role: PartnerRole = Depends(require_expert), db: AsyncSession = Depends(get_db)):
    return await service.get_expert_profile(db, role)


@router.put("/expert", response_model=LocalExpertProfileRead)
async def update_my_expert_profile(
    payload: LocalExpertProfileUpsert,
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.upsert_expert_profile(db, role, payload)


@router.get("/host", response_model=HostProfileRead)
async def get_my_host_profile(role: PartnerRole = Depends(require_host), db: AsyncSession = Depends(get_db)):
    return await service.get_host_profile(db, role)


@router.put("/host", response_model=HostProfileRead)
async def update_my_host_profile(
    payload: HostProfileUpsert,
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    return await service.upsert_host_profile(db, role, payload)


@router.put("/expert/photo", response_model=LocalExpertProfileRead)
async def set_expert_photo(
    file: UploadFile = File(...),
    role: PartnerRole = Depends(require_expert),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    return await service.set_expert_photo(
        db, role, file.filename or "photo", file.content_type or "application/octet-stream", data
    )


@router.get("/expert/{role_id}/photo/file")
async def get_expert_photo_file(role_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    # Not gated on the profile's is_published — a profile photo isn't sensitive, and
    # search results already only surface published profiles anyway.
    key, content_type = await service.get_expert_photo(db, role_id)
    return Response(content=storage.get_bytes(key), media_type=content_type)


@router.put("/host/photo", response_model=HostProfileRead)
async def set_host_photo(
    file: UploadFile = File(...),
    role: PartnerRole = Depends(require_host),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    return await service.set_host_photo(
        db, role, file.filename or "photo", file.content_type or "application/octet-stream", data
    )


@router.get("/host/{role_id}/photo/file")
async def get_host_photo_file(role_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    key, content_type = await service.get_host_photo(db, role_id)
    return Response(content=storage.get_bytes(key), media_type=content_type)
