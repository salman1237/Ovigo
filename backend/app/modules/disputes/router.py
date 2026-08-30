import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.disputes import service
from app.modules.disputes.models import DisputeStatus
from app.modules.disputes.schemas import DisputeCreate, DisputeRead, DisputeResolve
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/disputes", tags=["disputes"])
admin_router = APIRouter(prefix="/api/v1/admin/disputes", tags=["admin", "disputes"], dependencies=[Depends(require_admin)])


@router.post("", response_model=DisputeRead, status_code=201)
async def create_dispute(
    payload: DisputeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.create_dispute(db, current_user, payload)


@router.get("", response_model=list[DisputeRead])
async def list_my_disputes(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_my_disputes(db, current_user)


@router.get("/{dispute_id}", response_model=DisputeRead)
async def get_my_dispute(
    dispute_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.get_own_dispute_or_404(db, current_user, dispute_id)


@admin_router.get("", response_model=list[DisputeRead])
async def admin_list_disputes(status: DisputeStatus | None = Query(default=None), db: AsyncSession = Depends(get_db)):
    return await service.list_disputes(db, status)


@admin_router.post("/{dispute_id}/resolve", response_model=DisputeRead)
async def admin_resolve_dispute(
    dispute_id: uuid.UUID,
    payload: DisputeResolve,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.resolve_dispute(db, current_user, dispute_id, payload)
