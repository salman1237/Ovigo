"""Live chat: pre-booking inquiries and post-booking conversations between a
traveler and a partner (Local Expert / Host / Rent-a-Car).

A thread's `context_type` is fixed for its whole life. A pre-booking inquiry
(TOUR/PROPERTY/VEHICLE context) never turns into a post-booking thread —
confirming a booking opens a brand new thread scoped to the specific
BookingItem instead. This keeps the safety-rule boundary (contact-info
redaction, no attachments/location sharing before booking) a structural
property of the thread rather than a flag that has to flip mid-conversation.

Scope trims (consistent with this project's precedent of not building
speculative generality): exactly two participants per thread, no group chat;
no typing indicators; no message editing/deletion; a single `read_at`
timestamp per message is enough since there are only ever two parties, so
there's nothing to track per-recipient; attachments are images only, reusing
`app.core.storage`'s existing image validation rather than adding a new
file-type allowlist.

Contact-info redaction (pre-booking only) discards the original text
entirely rather than retaining it for admin review — `was_redacted` is a
boolean signal, not an audit trail of what was redacted. This is a
deliberate least-data-retention choice: the point of redaction is to stop
off-platform circumvention, not to build a surveillance log of attempts.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ChatContextType(str, enum.Enum):
    TOUR = "tour"
    PROPERTY = "property"
    VEHICLE = "vehicle"
    BOOKING_ITEM = "booking_item"


class ChatThreadStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"


class ChatMessageType(str, enum.Enum):
    TEXT = "text"
    ATTACHMENT = "attachment"
    LOCATION = "location"


class ChatThread(Base):
    __tablename__ = "chat_threads"
    __table_args__ = (
        UniqueConstraint(
            "traveler_id", "partner_role_id", "context_type", "context_id", name="uq_chat_thread_context"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    traveler_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    context_type: Mapped[ChatContextType] = mapped_column(Enum(ChatContextType, name="chat_context_type"))
    context_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    # Set only for a BOOKING_ITEM-context thread — this is what unlocks
    # attachments/location sharing and turns off contact-info redaction.
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ChatThreadStatus] = mapped_column(
        Enum(ChatThreadStatus, name="chat_thread_status"), default=ChatThreadStatus.OPEN
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    traveler: Mapped["User"] = relationship(foreign_keys=[traveler_id])  # noqa: F821
    partner_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.created_at"
    )


class ChatAttachment(Base):
    __tablename__ = "chat_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True
    )
    storage_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    file_name: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    message_type: Mapped[ChatMessageType] = mapped_column(
        Enum(ChatMessageType, name="chat_message_type"), default=ChatMessageType.TEXT
    )
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    was_redacted: Mapped[bool] = mapped_column(Boolean, default=False)
    attachment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_attachments.id", ondelete="SET NULL"), nullable=True
    )
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    is_reported: Mapped[bool] = mapped_column(Boolean, default=False)
    report_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reported_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped["ChatThread"] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship(foreign_keys=[sender_id])  # noqa: F821
    attachment: Mapped["ChatAttachment | None"] = relationship()
