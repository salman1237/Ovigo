import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.database import get_db
from app.modules.fraud import service
from app.modules.fraud.models import FraudFlagStatus
from app.modules.fraud.schemas import FraudFlagRead, FraudFlagResolve, ScanResult, UserRiskReport
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/admin/fraud", tags=["fraud"])


@router.get("/flags", response_model=list[FraudFlagRead])
async def list_flags(
    status: FraudFlagStatus | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_flags(db, status)


@router.post("/flags/{flag_id}/resolve", response_model=FraudFlagRead)
async def resolve_flag(
    flag_id: uuid.UUID,
    payload: FraudFlagResolve,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.resolve_flag(db, admin, flag_id, FraudFlagStatus.RESOLVED, payload.resolution_note)


@router.post("/flags/{flag_id}/dismiss", response_model=FraudFlagRead)
async def dismiss_flag(
    flag_id: uuid.UUID,
    payload: FraudFlagResolve,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.resolve_flag(db, admin, flag_id, FraudFlagStatus.DISMISSED, payload.resolution_note)


@router.get("/users/{user_id}/risk", response_model=UserRiskReport)
async def get_user_risk(
    user_id: uuid.UUID, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    score = await service.get_user_risk_score(db, user_id)
    flags = await service.get_user_flags(db, user_id)
    return UserRiskReport(user_id=user_id, risk_score=score, flags=flags)


@router.post("/scan-documents", response_model=ScanResult)
async def scan_documents(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    count = await service.scan_duplicate_identity_documents(db)
    return ScanResult(new_flags_count=count)
