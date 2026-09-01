import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.chat.models import ChatContextType, ChatMessageType, ChatThreadStatus
from app.modules.users.models import PartnerRoleType


class ChatThreadCreate(BaseModel):
    context_type: ChatContextType
    context_id: uuid.UUID


class ChatParticipant(BaseModel):
    id: uuid.UUID
    full_name: str
    role_type: PartnerRoleType | None = None


class ChatAttachmentRead(BaseModel):
    id: uuid.UUID
    file_name: str
    content_type: str
    size_bytes: int

    model_config = ConfigDict(from_attributes=True)


class ChatMessageCreate(BaseModel):
    message_type: ChatMessageType = ChatMessageType.TEXT
    body: str | None = Field(default=None, max_length=4000)
    latitude: Decimal | None = None
    longitude: Decimal | None = None

    @model_validator(mode="after")
    def _check_fields(self):
        if self.message_type == ChatMessageType.TEXT:
            if not self.body or not self.body.strip():
                raise ValueError("body is required for a text message")
        elif self.message_type == ChatMessageType.LOCATION:
            if self.latitude is None or self.longitude is None:
                raise ValueError("latitude and longitude are required for a location message")
        else:
            raise ValueError("Attachments must be sent via the attachments endpoint, not this one")
        return self


class ChatMessageRead(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    message_type: ChatMessageType
    body: str | None
    was_redacted: bool
    attachment: ChatAttachmentRead | None
    latitude: Decimal | None
    longitude: Decimal | None
    read_at: datetime | None
    created_at: datetime


class ChatThreadRead(BaseModel):
    id: uuid.UUID
    context_type: ChatContextType
    context_id: uuid.UUID
    context_title: str
    booking_id: uuid.UUID | None
    status: ChatThreadStatus
    other_party: ChatParticipant
    last_message: ChatMessageRead | None
    unread_count: int
    created_at: datetime
    updated_at: datetime


class ChatMessageReport(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class AdminChatThreadRead(BaseModel):
    id: uuid.UUID
    context_type: ChatContextType
    context_id: uuid.UUID
    context_title: str
    booking_id: uuid.UUID | None
    status: ChatThreadStatus
    traveler: ChatParticipant
    partner: ChatParticipant
    reported_message_count: int
    created_at: datetime
    updated_at: datetime
