import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationRead, UnreadCount
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


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
