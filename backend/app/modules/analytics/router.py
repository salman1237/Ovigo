from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_approved_role
from app.database import get_db
from app.modules.analytics import service
from app.modules.analytics.schemas import AnalyticsDashboard
from app.modules.users.models import PartnerRole, PartnerRoleType

router = APIRouter(prefix="/api/v1/partners/analytics", tags=["analytics"])


@router.get("/expert", response_model=AnalyticsDashboard)
async def get_expert_analytics(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_dashboard(db, role)


@router.get("/host", response_model=AnalyticsDashboard)
async def get_host_analytics(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.HOST, PartnerRoleType.HOTEL)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_dashboard(db, role)


@router.get("/vehicles", response_model=AnalyticsDashboard)
async def get_vehicle_analytics(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_dashboard(db, role)
