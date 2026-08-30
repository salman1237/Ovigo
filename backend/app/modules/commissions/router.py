from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.commissions import service
from app.modules.commissions.schemas import EarningsSummary
from app.modules.users.models import PartnerRole, PartnerRoleType

router = APIRouter(prefix="/api/v1/partners/earnings", tags=["commissions"])


@router.get("/expert", response_model=EarningsSummary)
async def get_expert_earnings(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_earnings_for_role(db, role)


@router.get("/host", response_model=EarningsSummary)
async def get_host_earnings(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.HOST, PartnerRoleType.HOTEL)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_earnings_for_role(db, role)
