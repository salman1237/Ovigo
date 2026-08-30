import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin, require_approved_role
from app.database import get_db
from app.modules.admin.schemas import RejectRequest
from app.modules.auth.utils import get_current_user
from app.modules.business_network import service
from app.modules.business_network.models import BusinessReferral, ReferralStatus
from app.modules.business_network.schemas import AdminBusinessReferralRead, BusinessReferralCreate, BusinessReferralRead
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/business-network", tags=["business-network"])
admin_router = APIRouter(
    prefix="/api/v1/admin/business-network", tags=["admin", "business-network"], dependencies=[Depends(require_admin)]
)


def _to_admin_read(referral: BusinessReferral) -> AdminBusinessReferralRead:
    return AdminBusinessReferralRead(
        **BusinessReferralRead.model_validate(referral).model_dump(),
        referring_expert_name=referral.referring_expert_role.partner_account.user.full_name,
    )


@router.post("", response_model=BusinessReferralRead, status_code=201)
async def create_referral(
    payload: BusinessReferralCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_referral(db, role, payload)


@router.get("", response_model=list[BusinessReferralRead])
async def list_my_referrals(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_referrals(db, role)


@router.get("/{referral_id}", response_model=BusinessReferralRead)
async def get_referral(
    referral_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_own_referral_or_404(db, role, referral_id)


@admin_router.get("", response_model=list[AdminBusinessReferralRead])
async def admin_list_referrals(status: ReferralStatus | None = None, db: AsyncSession = Depends(get_db)):
    referrals = await service.list_referrals(db, status)
    return [_to_admin_read(r) for r in referrals]


@admin_router.post("/{referral_id}/approve", response_model=AdminBusinessReferralRead)
async def admin_approve_referral(
    referral_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.approve_referral(db, current_user, referral_id)
    return _to_admin_read(referral)


@admin_router.post("/{referral_id}/reject", response_model=AdminBusinessReferralRead)
async def admin_reject_referral(
    referral_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.reject_referral(db, current_user, referral_id, payload.reason)
    return _to_admin_read(referral)
