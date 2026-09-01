import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.database import get_db
from app.modules.admin.schemas import RejectRequest
from app.modules.auth.utils import get_current_user
from app.modules.badges import service
from app.modules.badges.models import BadgeStatus
from app.modules.badges.schemas import AdminBadgeRead, BadgeApply, BadgeRead
from app.modules.locations.models import TaggableEntityType
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/badges", tags=["badges"])
admin_router = APIRouter(prefix="/api/v1/admin/badges", tags=["admin", "badges"], dependencies=[Depends(require_admin)])


@router.post("/apply", response_model=AdminBadgeRead, status_code=201)
async def apply_for_badge(
    payload: BadgeApply, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.apply_for_badge(db, current_user, payload)


@router.get("/mine", response_model=list[AdminBadgeRead])
async def list_my_applications(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # AdminBadgeRead here, not the public BadgeRead — an applicant needs to see their
    # own rejection_reason and private_note (which they themselves wrote); the
    # "private" in "privacy-protected" means private from *other* people, not from
    # the person who submitted it. list_my_applications() already scopes to the
    # caller's own rows, so this never leaks someone else's private data.
    return await service.list_my_applications(db, current_user)


@router.get("", response_model=list[BadgeRead])
async def list_for_entity(
    entity_type: TaggableEntityType = Query(...), entity_id: uuid.UUID = Query(...), db: AsyncSession = Depends(get_db)
):
    return await service.list_for_entity(db, entity_type, entity_id)


@admin_router.get("", response_model=list[AdminBadgeRead])
async def admin_list_badges(status: BadgeStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await service.list_all(db, status)


@admin_router.post("/{badge_id}/approve", response_model=AdminBadgeRead)
async def admin_approve_badge(badge_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await service.approve_badge(db, badge_id)


@admin_router.post("/{badge_id}/reject", response_model=AdminBadgeRead)
async def admin_reject_badge(badge_id: uuid.UUID, payload: RejectRequest, db: AsyncSession = Depends(get_db)):
    return await service.reject_badge(db, badge_id, payload.reason)
