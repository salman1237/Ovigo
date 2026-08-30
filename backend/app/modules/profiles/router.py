from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

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
