import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_permissions import require_admin_permission
from app.core.permissions import require_admin, require_approved_role
from app.database import get_db
from app.modules.admin.schemas import RejectRequest
from app.modules.auth.utils import get_current_user
from app.modules.business_network import service
from app.modules.business_network.models import BusinessReferral, ReferralStatus
from app.modules.business_network.schemas import (
    AdminBusinessReferralRead,
    BusinessReferralCreate,
    BusinessReferralRead,
    ClaimReferralRead,
    LinkPartnerRequest,
    SetCommissionRateRequest,
    VerifyBusinessRequest,
)
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


@router.post("/{referral_id}/send-invite", response_model=BusinessReferralRead)
async def send_invite(
    referral_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.send_invite(db, role, referral_id)


@router.get("/claim/{token}", response_model=ClaimReferralRead)
async def get_claim_info(token: str, db: AsyncSession = Depends(get_db)):
    referral = await service.get_claim_info(db, token)
    return ClaimReferralRead(
        id=referral.id,
        business_name=referral.business_name,
        business_type=referral.business_type,
        description=referral.description,
        referring_expert_name=referral.referring_expert_role.partner_account.user.full_name,
        already_claimed=referral.invited_user_id is not None,
    )


@router.post("/claim/{token}", response_model=BusinessReferralRead)
async def claim_referral(
    token: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.claim_referral(db, current_user, token)


@admin_router.get("", response_model=list[AdminBusinessReferralRead])
async def admin_list_referrals(
    status: ReferralStatus | None = None,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    referrals = await service.list_referrals(db, status)
    return [_to_admin_read(r) for r in referrals]


@admin_router.post("/{referral_id}/approve", response_model=AdminBusinessReferralRead)
async def admin_approve_referral(
    referral_id: uuid.UUID,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.approve_referral(db, current_user, referral_id)
    return _to_admin_read(referral)


@admin_router.post("/{referral_id}/link-partner", response_model=AdminBusinessReferralRead)
async def admin_link_partner(
    referral_id: uuid.UUID,
    payload: LinkPartnerRequest,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.link_partner(db, current_user, referral_id, payload.partner_role_id)
    return _to_admin_read(referral)


@admin_router.post("/{referral_id}/reject", response_model=AdminBusinessReferralRead)
async def admin_reject_referral(
    referral_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.reject_referral(db, current_user, referral_id, payload.reason)
    return _to_admin_read(referral)


@admin_router.post("/{referral_id}/verify-business", response_model=AdminBusinessReferralRead)
async def admin_verify_business(
    referral_id: uuid.UUID,
    payload: VerifyBusinessRequest,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.verify_business(db, current_user, referral_id, payload.verified)
    return _to_admin_read(referral)


@admin_router.post("/{referral_id}/commission-rate", response_model=AdminBusinessReferralRead)
async def admin_set_commission_rate(
    referral_id: uuid.UUID,
    payload: SetCommissionRateRequest,
    current_user: User = Depends(require_admin_permission("referrals.commission")),
    db: AsyncSession = Depends(get_db),
):
    referral = await service.set_commission_rate(db, current_user, referral_id, payload.rate)
    return _to_admin_read(referral)
