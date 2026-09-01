from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin, require_approved_role
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.payouts import service
from app.modules.payouts.schemas import PayoutPreviewRow, PayoutRead
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
async def preview_payouts(db: AsyncSession = Depends(get_db)):
    return await service.preview_payouts(db)


@admin_router.post("/run", response_model=list[PayoutRead])
async def run_payout_batch(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.run_payout_batch(db, current_user)


@admin_router.get("", response_model=list[PayoutRead])
async def list_all_payouts(db: AsyncSession = Depends(get_db)):
    return await service.list_all_payouts(db)
