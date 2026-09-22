import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_permissions import require_admin_permission
from app.core.permissions import require_admin, require_approved_role, require_role
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.guides import service
from app.modules.guides.schemas import (
    AssignmentCreate,
    AssignmentRead,
    AvailabilityRead,
    AvailabilitySet,
    GuideAdminSummary,
    GuideCertificationRead,
    GuideCertificationUpdate,
    GuideEarnings,
    GuideInviteCreate,
    GuideRestrictionUpdate,
    SupervisionRead,
    SupervisionRespond,
)
from app.modules.users.models import PartnerRole, PartnerRoleType, User

router = APIRouter(prefix="/api/v1/guides", tags=["guides"])
admin_router = APIRouter(prefix="/api/v1/admin/guides", tags=["admin", "guides"], dependencies=[Depends(require_admin)])


@router.post("/invite", response_model=SupervisionRead, status_code=201)
async def invite_guide(
    payload: GuideInviteCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.invite_guide(db, role, payload)


@router.get("/my-guides", response_model=list[SupervisionRead])
async def list_my_guides(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_guides(db, role)


@router.get("/my-supervision", response_model=SupervisionRead | None)
async def get_my_supervision(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_my_supervision(db, role)


@router.post("/supervisions/{supervision_id}/respond", response_model=SupervisionRead)
async def respond_to_invite(
    supervision_id: uuid.UUID,
    payload: SupervisionRespond,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.respond_to_invite(db, role, supervision_id, payload.accept)


@router.post("/supervisions/{supervision_id}/terminate", response_model=SupervisionRead)
async def terminate_supervision(
    supervision_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.terminate_supervision(db, current_user, supervision_id)


@router.post("/{guide_role_id}/assignments", response_model=AssignmentRead, status_code=201)
async def assign_guide(
    guide_role_id: uuid.UUID,
    payload: AssignmentCreate,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.assign_guide(db, role, guide_role_id, payload)


@router.get("/assignments/mine", response_model=list[AssignmentRead])
async def list_my_assignments(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_assignments_for_guide(db, role)


@router.get("/assignments/assigned-by-me", response_model=list[AssignmentRead])
async def list_assignments_by_me(
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_assignments_by_expert(db, role)


@router.post("/assignments/{assignment_id}/check-in", response_model=AssignmentRead)
async def check_in(
    assignment_id: uuid.UUID,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.check_in_assignment(db, role, assignment_id)


@router.post("/assignments/{assignment_id}/complete", response_model=AssignmentRead)
async def complete(
    assignment_id: uuid.UUID,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.complete_assignment(db, role, assignment_id)


@router.post("/assignments/{assignment_id}/cancel", response_model=AssignmentRead)
async def cancel(
    assignment_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.cancel_assignment(db, role, assignment_id)


@router.put("/availability", status_code=204)
async def set_availability(
    payload: AvailabilitySet,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    await service.set_availability(db, role, payload.dates, payload.is_available)


@router.get("/availability", response_model=list[AvailabilityRead])
async def list_availability(
    start: date = Query(...),
    end: date = Query(...),
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_availability(db, role, start, end)


@router.get("/earnings", response_model=GuideEarnings)
async def get_earnings(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_earnings(db, role)


@router.get("/certification/mine", response_model=GuideCertificationRead)
async def get_my_certification(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_my_certification(db, role)


@admin_router.get("", response_model=list[GuideAdminSummary])
async def admin_list_guides(
    current_user: User = Depends(require_admin_permission("guides.certify")), db: AsyncSession = Depends(get_db)
):
    return await service.admin_list_guides(db)


@admin_router.put("/{guide_role_id}/certification", response_model=GuideCertificationRead)
async def admin_set_certification(
    guide_role_id: uuid.UUID,
    payload: GuideCertificationUpdate,
    current_user: User = Depends(require_admin_permission("guides.certify")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_set_certification(db, current_user, guide_role_id, payload)


@admin_router.put("/{guide_role_id}/restriction", response_model=GuideCertificationRead)
async def admin_set_restriction(
    guide_role_id: uuid.UUID,
    payload: GuideRestrictionUpdate,
    current_user: User = Depends(require_admin_permission("guides.restrict")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_set_restriction(db, current_user, guide_role_id, payload)
