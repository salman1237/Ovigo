from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import TokenType, create_access_token, decode_token
from app.database import get_db
from app.modules.auth import service
from app.modules.auth.schemas import (
    AccessTokenResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    VerifyOtpRequest,
)
from app.modules.auth.utils import get_current_user
from app.modules.users.models import User
from app.core.exceptions import UnauthorizedError

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(request: Request, payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    user = await service.register_user(db, payload)
    access_token, refresh_token = service.issue_token_pair(user)
    return TokenPair(access_token=access_token, refresh_token=refresh_token, user=user)


@router.post("/login", response_model=TokenPair)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenPair:
    user = await service.authenticate_user(db, payload.identifier, payload.password)
    access_token, refresh_token = service.issue_token_pair(user)
    return TokenPair(access_token=access_token, refresh_token=refresh_token, user=user)


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(payload: RefreshRequest) -> AccessTokenResponse:
    token_payload = decode_token(payload.refresh_token)
    if token_payload is None or token_payload.get("type") != TokenType.REFRESH.value:
        raise UnauthorizedError("Invalid or expired refresh token")
    access_token = create_access_token(token_payload["sub"])
    return AccessTokenResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: User = Depends(get_current_user)) -> None:
    # Stateless JWTs: nothing to invalidate server-side yet. Once Redis is introduced
    # (Sprint 9 caching layer) this should blacklist the token's `jti` until it expires.
    return None


@router.post("/verify-email/request")
@limiter.limit("5/minute")
async def request_email_otp(
    request: Request, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    code = await service.generate_otp(db, current_user)
    response = {"message": "Verification code generated"}
    if settings.environment != "production":
        response["dev_code"] = code
    return response


@router.post("/verify-email/confirm")
@limiter.limit("10/minute")
async def confirm_email_otp(
    request: Request,
    payload: VerifyOtpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.verify_otp(db, current_user, payload.code, channel="email")
    return {"message": "Email verified"}


@router.post("/verify-phone/request")
@limiter.limit("5/minute")
async def request_phone_otp(
    request: Request, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    code = await service.generate_otp(db, current_user)
    response = {"message": "Verification code generated"}
    if settings.environment != "production":
        response["dev_code"] = code
    return response


@router.post("/verify-phone/confirm")
@limiter.limit("10/minute")
async def confirm_phone_otp(
    request: Request,
    payload: VerifyOtpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await service.verify_otp(db, current_user, payload.code, channel="phone")
    return {"message": "Phone verified"}
