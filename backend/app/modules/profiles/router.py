import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.permissions import require_approved_role
from app.core.rate_limit import limiter
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.profiles import service
from app.modules.profiles.schemas import (
    HostProfileRead,
    HostProfileUpsert,
    LocalExpertProfileRead,
    LocalExpertProfileUpsert,
    ProfileReportCreate,
    PublicLocalExpertProfile,
)
from app.modules.users.models import PartnerRole, PartnerRoleType, User

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
    data = await storage.get_bytes_async(key)
    return Response(content=data, media_type=content_type, headers=storage.IMAGE_CACHE_HEADERS)


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
    data = await storage.get_bytes_async(key)
    return Response(content=data, media_type=content_type, headers=storage.IMAGE_CACHE_HEADERS)


@router.get("/expert/{role_id}/public", response_model=PublicLocalExpertProfile)
@router.get("/public/expert/{role_id}", response_model=PublicLocalExpertProfile)
async def get_public_expert_profile(role_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await service.get_public_expert_profile(db, role_id)


@router.post("/expert/{role_id}/report", status_code=204)
@limiter.limit("5/minute")
async def report_expert_profile(
    request: Request,
    role_id: uuid.UUID,
    payload: ProfileReportCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.report_expert_profile(db, current_user, role_id, payload.reason)
