import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_permissions import require_admin_permission
from app.core.permissions import require_admin, require_approved_role
from app.core.rate_limit import limiter
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.referrals import service
from app.modules.referrals.schemas import (
    AdminAttributionRead,
    AttributionTermsUpdate,
    EffectiveStatus,
    NetworkMemberRead,
    PublicReferralLinkRead,
    ReassignAttributionRequest,
    ReferralLinkRead,
    RevokeAttributionRequest,
)
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/referrals", tags=["referrals"])
admin_router = APIRouter(
    prefix="/api/v1/admin/network-attributions", tags=["admin", "referrals"], dependencies=[Depends(require_admin)]
)

_expert = require_approved_role(PartnerRoleType.LOCAL_EXPERT)


@router.get("/me", response_model=ReferralLinkRead)
async def get_my_link(role: PartnerRole = Depends(_expert), db: AsyncSession = Depends(get_db)):
    """The expert's own referral link (created on first call), with network stats."""
    return await service.get_my_link(db, role)


@router.post("/me/regenerate", response_model=ReferralLinkRead)
async def regenerate_my_link(role: PartnerRole = Depends(_expert), db: AsyncSession = Depends(get_db)):
    """Issues a new code; the old one stops accepting new signups. Existing members
    are unaffected."""
    await service.regenerate_link(db, role)
    return await service.get_my_link(db, role)


@router.get("/me/members", response_model=list[NetworkMemberRead])
async def list_my_members(
    status: EffectiveStatus | None = None,
    role_type: PartnerRoleType | None = None,
    role: PartnerRole = Depends(_expert),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_members(db, role, status, role_type)


@router.get("/invite", response_model=PublicReferralLinkRead | None)
async def get_my_invite(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """The referral link the current user registered through, if it still applies —
    lets the partner application page show the invite even after a browser lost it."""
    return await service.get_my_invite(db, current_user)


@router.get("/links/{code}", response_model=PublicReferralLinkRead)
@limiter.limit("60/minute")
async def get_public_link(request: Request, code: str, db: AsyncSession = Depends(get_db)):
    """Public: who owns this referral link, for the /join/{code} landing page."""
    return await service.get_public_link(db, code)


@admin_router.get("", response_model=list[AdminAttributionRead])
async def admin_list_attributions(
    status: EffectiveStatus | None = None,
    expert_role_id: uuid.UUID | None = None,
    role_type: PartnerRoleType | None = None,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_list(db, status, expert_role_id, role_type)


@admin_router.post("/{attribution_id}/revoke", response_model=AdminAttributionRead)
async def admin_revoke_attribution(
    attribution_id: uuid.UUID,
    payload: RevokeAttributionRequest,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_revoke(db, current_user, attribution_id, payload.reason)


@admin_router.post("/{attribution_id}/reassign", response_model=AdminAttributionRead)
async def admin_reassign_attribution(
    attribution_id: uuid.UUID,
    payload: ReassignAttributionRequest,
    current_user: User = Depends(require_admin_permission("referrals.manage")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_reassign(db, current_user, attribution_id, payload.expert_role_id, payload.reason)


@admin_router.post("/{attribution_id}/terms", response_model=AdminAttributionRead)
async def admin_update_attribution_terms(
    attribution_id: uuid.UUID,
    payload: AttributionTermsUpdate,
    current_user: User = Depends(require_admin_permission("referrals.commission")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_update_terms(db, current_user, attribution_id, payload)
