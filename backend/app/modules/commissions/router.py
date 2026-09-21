import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_permissions import require_admin_permission
from app.core.permissions import require_admin, require_approved_role
from app.database import get_db
from app.modules.commissions import service
from app.modules.commissions.schemas import (
    CommissionPreviewRequest,
    CommissionPreviewResponse,
    CommissionRuleCreate,
    CommissionRuleRead,
    EarningsSummary,
)
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/partners/earnings", tags=["commissions"])
admin_router = APIRouter(
    prefix="/api/v1/admin/commission-rules", tags=["admin", "commissions"], dependencies=[Depends(require_admin)]
)


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


@router.get("/vehicles", response_model=EarningsSummary)
async def get_rent_a_car_earnings(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.RENT_A_CAR)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_earnings_for_role(db, role)


@admin_router.get("", response_model=list[CommissionRuleRead])
async def list_commission_rules(
    current_user: User = Depends(require_admin_permission("commission_rules.view")), db: AsyncSession = Depends(get_db)
):
    return await service.list_rules(db)


@admin_router.post("", response_model=CommissionRuleRead, status_code=201)
async def create_commission_rule(
    payload: CommissionRuleCreate,
    current_user: User = Depends(require_admin_permission("commission_rules.write")),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_rule(db, current_user, payload)


@admin_router.post("/{rule_id}/deactivate", response_model=CommissionRuleRead)
async def deactivate_commission_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(require_admin_permission("commission_rules.write")),
    db: AsyncSession = Depends(get_db),
):
    return await service.deactivate_rule(db, current_user, rule_id)


@admin_router.post("/preview", response_model=CommissionPreviewResponse)
async def preview_commission(
    payload: CommissionPreviewRequest,
    current_user: User = Depends(require_admin_permission("commission_rules.view")),
    db: AsyncSession = Depends(get_db),
):
    return await service.preview_commission(db, payload)
