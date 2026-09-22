import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_permissions import require_admin_permission
from app.core.permissions import require_admin, require_approved_role
from app.database import get_db
from app.modules.payouts import service
from app.modules.payouts.schemas import PayoutPreviewRow, PayoutRead, PayoutStatusUpdate
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/payouts", tags=["payouts"])
admin_router = APIRouter(prefix="/api/v1/admin/payouts", tags=["admin", "payouts"], dependencies=[Depends(require_admin)])


@router.get("/mine", response_model=list[PayoutRead])
async def list_my_payouts(
    role: PartnerRole = Depends(
        require_approved_role(
            PartnerRoleType.LOCAL_EXPERT, PartnerRoleType.HOST, PartnerRoleType.HOTEL, PartnerRoleType.GUIDE
        )
    ),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_payouts_for_role(db, role)


@admin_router.get("/preview", response_model=list[PayoutPreviewRow])
async def preview_payouts(
    current_user: User = Depends(require_admin_permission("payouts.view")), db: AsyncSession = Depends(get_db)
):
    return await service.preview_payouts(db)


@admin_router.post("/run", response_model=list[PayoutRead])
async def run_payout_batch(
    current_user: User = Depends(require_admin_permission("payouts.process")), db: AsyncSession = Depends(get_db)
):
    return await service.run_payout_batch(db, current_user)


@admin_router.get("", response_model=list[PayoutRead])
async def list_all_payouts(
    current_user: User = Depends(require_admin_permission("payouts.view")), db: AsyncSession = Depends(get_db)
):
    return await service.list_all_payouts(db)


@admin_router.put("/{payout_id}/status", response_model=PayoutRead)
async def update_payout_status(
    payout_id: uuid.UUID,
    payload: PayoutStatusUpdate,
    current_user: User = Depends(require_admin_permission("payouts.process")),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_payout_status(db, current_user, payout_id, payload)
