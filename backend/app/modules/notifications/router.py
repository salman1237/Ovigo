import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.notifications import service
from app.modules.notifications.schemas import (
    CampaignCreate,
    CampaignRead,
    NotificationRead,
    TemplateCreate,
    TemplateRead,
    TemplateUpdate,
    UnreadCount,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
admin_router = APIRouter(prefix="/api/v1/admin/notifications", tags=["notifications"], dependencies=[Depends(require_admin)])


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_for_user(db, current_user.id, unread_only)


@router.get("/unread-count", response_model=UnreadCount)
async def get_unread_count(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return UnreadCount(count=await service.unread_count(db, current_user.id))


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await service.mark_read(db, current_user.id, notification_id)
    return {"message": "Marked as read"}


@router.post("/read-all")
async def mark_all_read(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await service.mark_all_read(db, current_user.id)
    return {"message": "All marked as read"}


@admin_router.post("/templates", response_model=TemplateRead, status_code=201)
async def create_template(payload: TemplateCreate, db: AsyncSession = Depends(get_db)):
    return await service.create_template(db, payload)


@admin_router.get("/templates", response_model=list[TemplateRead])
async def list_templates(db: AsyncSession = Depends(get_db)):
    return await service.list_templates(db)


@admin_router.put("/templates/{template_id}", response_model=TemplateRead)
async def update_template(template_id: uuid.UUID, payload: TemplateUpdate, db: AsyncSession = Depends(get_db)):
    return await service.update_template(db, template_id, payload)


@admin_router.delete("/templates/{template_id}", status_code=204)
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await service.delete_template(db, template_id)


@admin_router.post("/campaigns", response_model=CampaignRead, status_code=201)
async def send_campaign(
    payload: CampaignCreate, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.send_campaign(db, current_user, payload)


@admin_router.get("/campaigns", response_model=list[CampaignRead])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    return await service.list_campaigns(db)
