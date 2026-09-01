"""Chat service. See models.py for the design rationale (fixed context_type
per thread, redaction-not-retention for pre-booking safety, two-party-only
scope trims).

Partner-role resolution for a BOOKING_ITEM context reuses
commissions/service.py's `_partner_role_for_item` rather than duplicating
that per-item-type join logic a third time (bookings/service.py's
reservation logic and commissions/service.py's attribution logic already
each need it).
"""
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit, storage
from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import TokenType, decode_token
from app.modules.bookings.models import Booking, BookingItem
from app.modules.chat.models import ChatAttachment, ChatContextType, ChatMessage, ChatMessageType, ChatThread, ChatThreadStatus
from app.modules.chat.schemas import (
    AdminChatThreadRead,
    ChatAttachmentRead,
    ChatMessageCreate,
    ChatMessageRead,
    ChatMessageReport,
    ChatParticipant,
    ChatThreadCreate,
    ChatThreadRead,
)
from app.modules.commissions.service import _partner_role_for_item
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.rentcar.models import Vehicle
from app.modules.stays.models import Property
from app.modules.tours.models import Tour
from app.modules.users.models import PartnerAccount, PartnerRole, SystemRole, User

_EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+")
_URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\-\s]{7,}\d)(?!\d)")


def _redact_contact_info(text: str) -> tuple[str, bool]:
    """Heuristic-only redaction of emails, URLs and phone-number-shaped digit
    runs. Not perfect (see module docstring for why the original is discarded
    rather than retained) — good enough to deter casual off-platform contact
    sharing before a booking exists, not a security control."""
    redacted = False

    def _sub(pattern: re.Pattern, s: str) -> str:
        nonlocal redacted
        new_s, count = pattern.subn("[redacted]", s)
        if count:
            redacted = True
        return new_s

    text = _sub(_EMAIL_RE, text)
    text = _sub(_URL_RE, text)
    text = _sub(_PHONE_RE, text)
    return text, redacted


async def _user_id_for_partner_role(db: AsyncSession, role_id: uuid.UUID) -> uuid.UUID | None:
    result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == role_id)
    )
    return result.scalar_one_or_none()


async def _resolve_context(
    db: AsyncSession, context_type: ChatContextType, context_id: uuid.UUID
) -> tuple[uuid.UUID, uuid.UUID | None, str]:
    """Returns (partner_role_id, booking_id, context_title) for a chat context."""
    if context_type == ChatContextType.TOUR:
        result = await db.execute(select(Tour.local_expert_role_id, Tour.title).where(Tour.id == context_id))
        row = result.first()
        if row is None:
            raise NotFoundError("Tour not found")
        return row[0], None, row[1]
    if context_type == ChatContextType.PROPERTY:
        result = await db.execute(select(Property.host_role_id, Property.name).where(Property.id == context_id))
        row = result.first()
        if row is None:
            raise NotFoundError("Property not found")
        return row[0], None, row[1]
    if context_type == ChatContextType.VEHICLE:
        result = await db.execute(
            select(Vehicle.rent_a_car_role_id, Vehicle.make, Vehicle.model).where(Vehicle.id == context_id)
        )
        row = result.first()
        if row is None:
            raise NotFoundError("Vehicle not found")
        return row[0], None, f"{row[1]} {row[2]}"
    if context_type == ChatContextType.BOOKING_ITEM:
        result = await db.execute(select(BookingItem).where(BookingItem.id == context_id))
        item = result.scalar_one_or_none()
        if item is None:
            raise NotFoundError("Booking item not found")
        partner_role_id = await _partner_role_for_item(db, item)
        if partner_role_id is None:
            raise NotFoundError("Could not resolve a partner for this booking item")
        return partner_role_id, item.booking_id, f"Booking #{str(item.booking_id)[:8]}"
    raise NotFoundError("Unknown chat context")


async def get_or_create_thread(db: AsyncSession, user: User, payload: ChatThreadCreate) -> ChatThreadRead:
    partner_role_id, booking_id, context_title = await _resolve_context(db, payload.context_type, payload.context_id)

    owner_user_id = await _user_id_for_partner_role(db, partner_role_id)
    if owner_user_id == user.id:
        raise ConflictError("You can't start a chat about your own listing")

    if payload.context_type == ChatContextType.BOOKING_ITEM:
        result = await db.execute(
            select(Booking.user_id)
            .join(BookingItem, BookingItem.booking_id == Booking.id)
            .where(BookingItem.id == payload.context_id)
        )
        traveler_id = result.scalar_one_or_none()
        if traveler_id != user.id:
            raise NotFoundError("Booking item not found")

    result = await db.execute(
        select(ChatThread).where(
            ChatThread.traveler_id == user.id,
            ChatThread.partner_role_id == partner_role_id,
            ChatThread.context_type == payload.context_type,
            ChatThread.context_id == payload.context_id,
        )
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        thread = ChatThread(
            traveler_id=user.id,
            partner_role_id=partner_role_id,
            context_type=payload.context_type,
            context_id=payload.context_id,
            booking_id=booking_id,
        )
        db.add(thread)
        await db.commit()
        await db.refresh(thread)

    return await _to_thread_read(db, user.id, thread, context_title=context_title)


async def _get_participant_thread_or_404(db: AsyncSession, user: User, thread_id: uuid.UUID) -> ChatThread:
    result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Conversation not found")
    if thread.traveler_id != user.id:
        partner_user_id = await _user_id_for_partner_role(db, thread.partner_role_id)
        if partner_user_id != user.id:
            raise NotFoundError("Conversation not found")
    return thread


async def _other_participant_user_id(db: AsyncSession, user: User, thread: ChatThread) -> uuid.UUID | None:
    if user.id == thread.traveler_id:
        return await _user_id_for_partner_role(db, thread.partner_role_id)
    return thread.traveler_id


async def _to_thread_read(
    db: AsyncSession, viewer_id: uuid.UUID, thread: ChatThread, context_title: str | None = None
) -> ChatThreadRead:
    if context_title is None:
        _, _, context_title = await _resolve_context(db, thread.context_type, thread.context_id)

    if viewer_id == thread.traveler_id:
        other_user_id = await _user_id_for_partner_role(db, thread.partner_role_id)
        role_result = await db.execute(select(PartnerRole.role_type).where(PartnerRole.id == thread.partner_role_id))
        other_role_type = role_result.scalar_one_or_none()
    else:
        other_user_id = thread.traveler_id
        other_role_type = None

    name_result = await db.execute(select(User.full_name).where(User.id == other_user_id))
    other_full_name = name_result.scalar_one_or_none() or "Unknown"

    last_message_result = await db.execute(
        select(ChatMessage).where(ChatMessage.thread_id == thread.id).order_by(ChatMessage.created_at.desc()).limit(1)
    )
    last_message = last_message_result.scalar_one_or_none()
    last_message_read = (await _messages_to_read(db, [last_message]))[0] if last_message else None

    unread_result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.thread_id == thread.id, ChatMessage.sender_id != viewer_id, ChatMessage.read_at.is_(None)
        )
    )
    unread_count = unread_result.scalar_one()

    return ChatThreadRead(
        id=thread.id,
        context_type=thread.context_type,
        context_id=thread.context_id,
        context_title=context_title,
        booking_id=thread.booking_id,
        status=thread.status,
        other_party=ChatParticipant(id=other_user_id, full_name=other_full_name, role_type=other_role_type),
        last_message=last_message_read,
        unread_count=unread_count,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


async def list_my_threads(db: AsyncSession, user: User) -> list[ChatThreadRead]:
    role_ids_result = await db.execute(
        select(PartnerRole.id)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerAccount.user_id == user.id)
    )
    my_role_ids = list(role_ids_result.scalars().all())

    result = await db.execute(
        select(ChatThread)
        .where(or_(ChatThread.traveler_id == user.id, ChatThread.partner_role_id.in_(my_role_ids)))
        .order_by(ChatThread.updated_at.desc())
    )
    threads = list(result.scalars().all())
    return [await _to_thread_read(db, user.id, t) for t in threads]


async def get_thread_read_or_404(db: AsyncSession, user: User, thread_id: uuid.UUID) -> ChatThreadRead:
    thread = await _get_participant_thread_or_404(db, user, thread_id)
    return await _to_thread_read(db, user.id, thread)


async def _messages_to_read(db: AsyncSession, messages: list[ChatMessage]) -> list[ChatMessageRead]:
    if not messages:
        return []
    sender_ids = {m.sender_id for m in messages}
    attachment_ids = {m.attachment_id for m in messages if m.attachment_id}

    names_result = await db.execute(select(User.id, User.full_name).where(User.id.in_(sender_ids)))
    names = dict(names_result.all())

    attachments: dict[uuid.UUID, ChatAttachment] = {}
    if attachment_ids:
        att_result = await db.execute(select(ChatAttachment).where(ChatAttachment.id.in_(attachment_ids)))
        attachments = {a.id: a for a in att_result.scalars().all()}

    return [
        ChatMessageRead(
            id=m.id,
            thread_id=m.thread_id,
            sender_id=m.sender_id,
            sender_name=names.get(m.sender_id, "Unknown"),
            message_type=m.message_type,
            body=m.body,
            was_redacted=m.was_redacted,
            attachment=ChatAttachmentRead.model_validate(attachments[m.attachment_id])
            if m.attachment_id in attachments
            else None,
            latitude=m.latitude,
            longitude=m.longitude,
            read_at=m.read_at,
            created_at=m.created_at,
        )
        for m in messages
    ]


async def list_messages(
    db: AsyncSession, user: User, thread_id: uuid.UUID, before: datetime | None, limit: int
) -> list[ChatMessageRead]:
    await _get_participant_thread_or_404(db, user, thread_id)
    query = select(ChatMessage).where(ChatMessage.thread_id == thread_id)
    if before is not None:
        query = query.where(ChatMessage.created_at < before)
    result = await db.execute(query.order_by(ChatMessage.created_at.desc()).limit(limit))
    messages = list(result.scalars().all())
    messages.reverse()
    return await _messages_to_read(db, messages)


async def send_message(
    db: AsyncSession, user: User, thread_id: uuid.UUID, payload: ChatMessageCreate
) -> ChatMessageRead:
    thread = await _get_participant_thread_or_404(db, user, thread_id)
    if thread.status == ChatThreadStatus.CLOSED:
        raise ConflictError("This conversation has been closed by an admin")

    is_pre_booking = thread.booking_id is None
    if payload.message_type == ChatMessageType.LOCATION and is_pre_booking:
        raise ConflictError("Location sharing is only available after a booking is confirmed")

    body = payload.body
    was_redacted = False
    if payload.message_type == ChatMessageType.TEXT and is_pre_booking:
        body, was_redacted = _redact_contact_info(payload.body)

    message = ChatMessage(
        thread_id=thread.id,
        sender_id=user.id,
        message_type=payload.message_type,
        body=body,
        was_redacted=was_redacted,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.add(message)
    thread.updated_at = datetime.now(timezone.utc)

    recipient_id = await _other_participant_user_id(db, user, thread)
    if recipient_id is not None:
        await notifications_service.notify(
            db,
            user_id=recipient_id,
            type=NotificationType.NEW_CHAT_MESSAGE,
            title="New message",
            message=(body or "Sent an attachment")[:200],
            link=f"/chat/{thread.id}",
        )

    await db.commit()
    await db.refresh(message)
    return (await _messages_to_read(db, [message]))[0]


async def send_attachment(
    db: AsyncSession, user: User, thread_id: uuid.UUID, file_name: str, content_type: str, data: bytes
) -> ChatMessageRead:
    thread = await _get_participant_thread_or_404(db, user, thread_id)
    if thread.status == ChatThreadStatus.CLOSED:
        raise ConflictError("This conversation has been closed by an admin")
    if thread.booking_id is None:
        raise ConflictError("Attachments are only available after a booking is confirmed")

    storage.validate_image(content_type, len(data))
    key = storage.build_key(f"chat/{thread_id}", file_name)
    storage.upload_bytes(key, data, content_type)

    attachment = ChatAttachment(
        thread_id=thread.id,
        storage_key=key,
        content_type=content_type,
        file_name=file_name,
        size_bytes=len(data),
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    await db.flush()

    message = ChatMessage(
        thread_id=thread.id,
        sender_id=user.id,
        message_type=ChatMessageType.ATTACHMENT,
        attachment_id=attachment.id,
    )
    db.add(message)
    thread.updated_at = datetime.now(timezone.utc)

    recipient_id = await _other_participant_user_id(db, user, thread)
    if recipient_id is not None:
        await notifications_service.notify(
            db,
            user_id=recipient_id,
            type=NotificationType.NEW_CHAT_MESSAGE,
            title="New message",
            message="Sent an attachment",
            link=f"/chat/{thread.id}",
        )

    await db.commit()
    await db.refresh(message)
    return (await _messages_to_read(db, [message]))[0]


async def get_attachment_or_404(
    db: AsyncSession, user: User, thread_id: uuid.UUID, attachment_id: uuid.UUID
) -> ChatAttachment:
    await _get_participant_thread_or_404(db, user, thread_id)
    result = await db.execute(
        select(ChatAttachment).where(ChatAttachment.id == attachment_id, ChatAttachment.thread_id == thread_id)
    )
    attachment = result.scalar_one_or_none()
    if attachment is None:
        raise NotFoundError("Attachment not found")
    return attachment


async def mark_thread_read(db: AsyncSession, user: User, thread_id: uuid.UUID) -> None:
    await _get_participant_thread_or_404(db, user, thread_id)
    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.thread_id == thread_id, ChatMessage.sender_id != user.id, ChatMessage.read_at.is_(None))
        .values(read_at=func.now())
    )
    await db.commit()


async def report_message(db: AsyncSession, user: User, message_id: uuid.UUID, payload: ChatMessageReport) -> None:
    result = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id))
    message = result.scalar_one_or_none()
    if message is None:
        raise NotFoundError("Message not found")
    thread = await _get_participant_thread_or_404(db, user, message.thread_id)

    message.is_reported = True
    message.report_reason = payload.reason
    message.reported_by_id = user.id
    message.reported_at = datetime.now(timezone.utc)

    admins_result = await db.execute(
        select(User.id).where(User.system_role.in_([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]))
    )
    for admin_id in admins_result.scalars().all():
        await notifications_service.notify(
            db,
            user_id=admin_id,
            type=NotificationType.CHAT_MESSAGE_REPORTED,
            title="Chat message reported",
            message=f"{user.full_name} reported a message in a conversation.",
            link=f"/admin/chat?thread={thread.id}",
        )
    await db.commit()


async def authenticate_ws_user(db: AsyncSession, token: str) -> User | None:
    payload = decode_token(token)
    if payload is None or payload.get("type") != TokenType.ACCESS.value:
        return None
    user_id = payload.get("sub")
    if user_id is None:
        return None
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    return user


async def is_thread_participant(db: AsyncSession, user: User, thread_id: uuid.UUID) -> bool:
    result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    thread = result.scalar_one_or_none()
    if thread is None:
        return False
    if thread.traveler_id == user.id:
        return True
    partner_user_id = await _user_id_for_partner_role(db, thread.partner_role_id)
    return partner_user_id == user.id


# --- admin moderation ---


async def _to_admin_thread_read(db: AsyncSession, thread: ChatThread) -> AdminChatThreadRead:
    _, _, context_title = await _resolve_context(db, thread.context_type, thread.context_id)

    traveler_result = await db.execute(select(User.full_name).where(User.id == thread.traveler_id))
    traveler_name = traveler_result.scalar_one_or_none() or "Unknown"

    partner_row_result = await db.execute(
        select(User.id, User.full_name, PartnerRole.role_type)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .join(User, User.id == PartnerAccount.user_id)
        .where(PartnerRole.id == thread.partner_role_id)
    )
    partner_row = partner_row_result.first()
    partner_id, partner_name, partner_role_type = partner_row if partner_row else (None, "Unknown", None)

    reported_count_result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.thread_id == thread.id, ChatMessage.is_reported.is_(True)
        )
    )
    reported_count = reported_count_result.scalar_one()

    return AdminChatThreadRead(
        id=thread.id,
        context_type=thread.context_type,
        context_id=thread.context_id,
        context_title=context_title,
        booking_id=thread.booking_id,
        status=thread.status,
        traveler=ChatParticipant(id=thread.traveler_id, full_name=traveler_name, role_type=None),
        partner=ChatParticipant(id=partner_id, full_name=partner_name, role_type=partner_role_type),
        reported_message_count=reported_count,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
    )


async def list_admin_threads(
    db: AsyncSession, status_filter: ChatThreadStatus | None, reported_only: bool
) -> list[AdminChatThreadRead]:
    query = select(ChatThread)
    if status_filter is not None:
        query = query.where(ChatThread.status == status_filter)
    if reported_only:
        query = query.join(ChatMessage, ChatMessage.thread_id == ChatThread.id).where(
            ChatMessage.is_reported.is_(True)
        )
    result = await db.execute(query.order_by(ChatThread.updated_at.desc()).distinct())
    threads = list(result.scalars().all())
    return [await _to_admin_thread_read(db, t) for t in threads]


async def admin_get_thread_messages(
    db: AsyncSession, admin: User, thread_id: uuid.UUID, reason: str
) -> list[ChatMessageRead]:
    result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Conversation not found")

    messages_result = await db.execute(
        select(ChatMessage).where(ChatMessage.thread_id == thread_id).order_by(ChatMessage.created_at)
    )
    messages = list(messages_result.scalars().all())

    await audit.record(
        db,
        actor_id=admin.id,
        action="chat.admin_view_messages",
        entity_type="chat_thread",
        entity_id=thread_id,
        extra={"reason": reason},
    )
    return await _messages_to_read(db, messages)


async def admin_close_thread(db: AsyncSession, admin: User, thread_id: uuid.UUID) -> AdminChatThreadRead:
    result = await db.execute(select(ChatThread).where(ChatThread.id == thread_id))
    thread = result.scalar_one_or_none()
    if thread is None:
        raise NotFoundError("Conversation not found")

    thread.status = ChatThreadStatus.CLOSED
    await db.commit()
    await audit.record(
        db, actor_id=admin.id, action="chat.admin_close_thread", entity_type="chat_thread", entity_id=thread_id
    )
    await db.refresh(thread)
    return await _to_admin_thread_read(db, thread)
