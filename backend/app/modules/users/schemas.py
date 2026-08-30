import uuid

from pydantic import BaseModel, ConfigDict

from app.modules.users.models import SystemRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    phone: str | None
    full_name: str
    system_role: SystemRole
    is_active: bool
    is_email_verified: bool
    is_phone_verified: bool


class UserUpdate(BaseModel):
    full_name: str | None = None
