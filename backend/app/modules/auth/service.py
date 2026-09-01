import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.modules.auth.schemas import RegisterRequest
from app.modules.users.models import User

OTP_TTL_MINUTES = 10


async def register_user(db: AsyncSession, payload: RegisterRequest) -> User:
    conditions = []
    if payload.email:
        conditions.append(User.email == payload.email)
    if payload.phone:
        conditions.append(User.phone == payload.phone)

    result = await db.execute(select(User).where(or_(*conditions)))
    if result.scalar_one_or_none() is not None:
        raise ConflictError("An account with this email or phone already exists")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, identifier: str, password: str) -> User:
    result = await db.execute(select(User).where(or_(User.email == identifier, User.phone == identifier)))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Invalid credentials")
    if not user.is_active:
        raise UnauthorizedError("Account is disabled")
    return user


def issue_token_pair(user: User) -> tuple[str, str]:
    access_token = create_access_token(str(user.id), roles=[user.system_role.value])
    refresh_token = create_refresh_token(str(user.id))
    return access_token, refresh_token


async def generate_otp(db: AsyncSession, user: User) -> str:
    """Stores the OTP on the user row and returns it to the caller. The router only
    echoes this back in the response when `settings.environment != "production"` —
    there's still no real SMS/email provider dispatch (tracked for the Sprint 9 /
    Phase 3 notification work), so in production today the code goes nowhere at all
    until that lands. Don't rely on this for a production launch as-is.
    """
    code = f"{random.randint(0, 999999):06d}"
    user.otp_code = code
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)
    await db.commit()
    return code


async def verify_otp(db: AsyncSession, user: User, code: str, *, channel: str) -> None:
    if (
        user.otp_code is None
        or user.otp_expires_at is None
        or user.otp_expires_at < datetime.now(timezone.utc)
        or user.otp_code != code
    ):
        raise UnauthorizedError("Invalid or expired verification code")

    if channel == "email":
        user.is_email_verified = True
    elif channel == "phone":
        user.is_phone_verified = True

    user.otp_code = None
    user.otp_expires_at = None
    await db.commit()
