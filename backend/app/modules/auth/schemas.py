from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modules.users.schemas import UserRead


class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr | None = None
    phone: str | None = None
    password: str
    # An expert referral link code (/join/{code}) — optional, and an invalid one is
    # ignored rather than failing signup (see referrals/service.py::record_signup_link).
    referral_code: str | None = Field(default=None, max_length=32)

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v

    @field_validator("phone")
    @classmethod
    def require_email_or_phone(cls, v: str | None, info):
        if not v and not info.data.get("email"):
            raise ValueError("Either email or phone is required")
        return v


class LoginRequest(BaseModel):
    identifier: str  # email or phone
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshRequest(BaseModel):
    refresh_token: str


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class VerifyOtpRequest(BaseModel):
    identifier: str
    code: str
