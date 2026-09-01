import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.permissions import require_admin
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.chat import service
from app.modules.chat.manager import manager
from app.modules.chat.models import ChatThreadStatus
from app.modules.chat.schemas import (
    AdminChatThreadRead,
    ChatMessageCreate,
    ChatMessageRead,
    ChatMessageReport,
    ChatThreadCreate,
    ChatThreadRead,
)
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])
admin_router = APIRouter(prefix="/api/v1/admin/chat", tags=["admin-chat"], dependencies=[Depends(require_admin)])


@router.post("/threads", response_model=ChatThreadRead)
async def create_thread(
    payload: ChatThreadCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.get_or_create_thread(db, user, payload)


@router.get("/threads", response_model=list[ChatThreadRead])
async def list_threads(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_my_threads(db, user)


@router.get("/threads/{thread_id}", response_model=ChatThreadRead)
async def get_thread(
    thread_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.get_thread_read_or_404(db, user, thread_id)


@router.get("/threads/{thread_id}/messages", response_model=list[ChatMessageRead])
async def get_messages(
    thread_id: uuid.UUID,
    before: datetime | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_messages(db, user, thread_id, before, limit)


@router.post("/threads/{thread_id}/messages", response_model=ChatMessageRead)
async def post_message(
    thread_id: uuid.UUID,
    payload: ChatMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await service.send_message(db, user, thread_id, payload)
    await manager.broadcast(thread_id, message.model_dump(mode="json"))
    return message


@router.post("/threads/{thread_id}/attachments", response_model=ChatMessageRead)
async def post_attachment(
    thread_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    message = await service.send_attachment(
        db, user, thread_id, file.filename or "image", file.content_type or "application/octet-stream", data
    )
    await manager.broadcast(thread_id, message.model_dump(mode="json"))
    return message


@router.get("/threads/{thread_id}/attachments/{attachment_id}/file")
async def get_attachment_file(
    thread_id: uuid.UUID,
    attachment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attachment = await service.get_attachment_or_404(db, user, thread_id, attachment_id)
    return Response(content=storage.get_bytes(attachment.storage_key), media_type=attachment.content_type)


@router.post("/threads/{thread_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    thread_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    await service.mark_thread_read(db, user, thread_id)


@router.post("/messages/{message_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_message(
    message_id: uuid.UUID,
    payload: ChatMessageReport,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.report_message(db, user, message_id, payload)


@router.websocket("/ws/{thread_id}")
async def chat_ws(
    websocket: WebSocket, thread_id: uuid.UUID, token: str = Query(...), db: AsyncSession = Depends(get_db)
):
    user = await service.authenticate_ws_user(db, token)
    if user is None or not await service.is_thread_participant(db, user, thread_id):
        await websocket.close(code=4401)
        return

    await manager.connect(thread_id, websocket)
    try:
        while True:
            # Clients don't send anything meaningful over this socket — REST is the
            # source of truth for persistence (see chat/service.py). We just block
            # here to detect disconnect and keep the connection registered.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(thread_id, websocket)


# --- admin moderation ---


@admin_router.get("/threads", response_model=list[AdminChatThreadRead])
async def admin_list_threads(
    status_filter: ChatThreadStatus | None = Query(default=None, alias="status"),
    reported_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_admin_threads(db, status_filter, reported_only)


@admin_router.get("/threads/{thread_id}/messages", response_model=list[ChatMessageRead])
async def admin_get_messages(
    thread_id: uuid.UUID,
    reason: str = Query(..., min_length=3),
    admin: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.admin_get_thread_messages(db, admin, thread_id, reason)


@admin_router.post("/threads/{thread_id}/close", response_model=AdminChatThreadRead)
async def admin_close_thread(
    thread_id: uuid.UUID, admin: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.admin_close_thread(db, admin, thread_id)
