import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.admin_permissions import require_admin_permission
from app.core.permissions import require_admin, require_approved_role, require_role
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.guides import service
from app.modules.guides.models import GuideProfileStatus
from app.modules.guides.schemas import (
    AdminGuideProfileRead,
    AssignmentCreate,
    AssignmentRead,
    AvailabilityRead,
    AvailabilitySet,
    GuideAdminSummary,
    GuideBookingRead,
    GuideCertificationRead,
    GuideCertificationUpdate,
    GuideEarnings,
    GuideInviteCreate,
    GuideOpenDates,
    GuidePackageCreate,
    GuidePackageRead,
    GuidePackageUpdate,
    GuideProfileModeration,
    GuideProfileRead,
    GuideProfileUpdate,
    GuideRestrictionUpdate,
    PublicGuideDetail,
    PublicGuideSummary,
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


@router.get("/my-supervisions", response_model=list[SupervisionRead])
async def list_my_supervisions(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_supervisions(db, role)


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


@router.get("/{guide_role_id}/packages", response_model=list[GuidePackageRead])
async def list_guide_packages_for_expert(
    guide_role_id: uuid.UUID,
    role: PartnerRole = Depends(require_approved_role(PartnerRoleType.LOCAL_EXPERT)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_packages_for_expert(db, role, guide_role_id)


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


# --- Guide services (Phase 9.3) ---


@router.get("/profile/mine", response_model=GuideProfileRead)
async def get_my_profile(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_or_create_my_profile(db, role)


@router.put("/profile/mine", response_model=GuideProfileRead)
async def update_my_profile(
    payload: GuideProfileUpdate,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_my_profile(db, role, payload)


@router.post("/profile/mine/submit", response_model=GuideProfileRead)
async def submit_my_profile(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.submit_my_profile(db, role)


@router.get("/packages/mine", response_model=list[GuidePackageRead])
async def list_my_packages(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_packages(db, role)


@router.post("/packages", response_model=GuidePackageRead, status_code=201)
async def create_package(
    payload: GuidePackageCreate,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_package(db, role, payload)


@router.patch("/packages/{package_id}", response_model=GuidePackageRead)
async def update_package(
    package_id: uuid.UUID,
    payload: GuidePackageUpdate,
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.update_package(db, role, package_id, payload)


@router.get("/bookings/mine", response_model=list[GuideBookingRead])
async def list_my_bookings(
    role: PartnerRole = Depends(require_role(PartnerRoleType.GUIDE)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_my_bookings(db, role)


@router.get("/public", response_model=list[PublicGuideSummary])
async def list_public_guides(
    city: str | None = Query(default=None, max_length=120),
    language: str | None = Query(default=None, max_length=40),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_public_guides(db, city, language)


@router.get("/public/{guide_role_id}", response_model=PublicGuideDetail)
async def get_public_guide(guide_role_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await service.get_public_guide(db, guide_role_id)


@router.get("/public/{guide_role_id}/open-dates", response_model=GuideOpenDates)
async def get_public_open_dates(
    guide_role_id: uuid.UUID,
    start: date = Query(...),
    end: date = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return {"dates": await service.public_open_dates(db, guide_role_id, start, end)}


@admin_router.get("/profiles", response_model=list[AdminGuideProfileRead])
async def admin_list_profiles(
    status: GuideProfileStatus | None = Query(default=None),
    current_user: User = Depends(require_admin_permission("guides.certify")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_list_profiles(db, status)


@admin_router.post("/profiles/{guide_role_id}/approve", response_model=AdminGuideProfileRead)
async def admin_approve_profile(
    guide_role_id: uuid.UUID,
    current_user: User = Depends(require_admin_permission("guides.certify")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_approve_profile(db, current_user, guide_role_id)


@admin_router.post("/profiles/{guide_role_id}/reject", response_model=AdminGuideProfileRead)
async def admin_reject_profile(
    guide_role_id: uuid.UUID,
    payload: GuideProfileModeration,
    current_user: User = Depends(require_admin_permission("guides.certify")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_reject_profile(db, current_user, guide_role_id, payload.reason)


@admin_router.post("/profiles/{guide_role_id}/suspend", response_model=AdminGuideProfileRead)
async def admin_suspend_profile(
    guide_role_id: uuid.UUID,
    payload: GuideProfileModeration,
    current_user: User = Depends(require_admin_permission("guides.restrict")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_suspend_profile(db, current_user, guide_role_id, payload.reason)


@admin_router.post("/profiles/{guide_role_id}/unsuspend", response_model=AdminGuideProfileRead)
async def admin_unsuspend_profile(
    guide_role_id: uuid.UUID,
    current_user: User = Depends(require_admin_permission("guides.restrict")),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_unsuspend_profile(db, current_user, guide_role_id)


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
