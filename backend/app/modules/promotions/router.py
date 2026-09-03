import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_admin
from app.database import get_db
from app.modules.promotions import service
from app.modules.promotions.schemas import PromoCodeCreate, PromoCodeRead, PromoCodeValidateResult
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/promotions", tags=["promotions"])
admin_router = APIRouter(
    prefix="/api/v1/admin/promotions", tags=["admin-promotions"], dependencies=[Depends(require_admin)]
)


@router.get("/validate/{code}", response_model=PromoCodeValidateResult)
async def validate_promo_code(code: str, db: AsyncSession = Depends(get_db)):
    return await service.validate_promo_code(db, code)


@admin_router.post("", response_model=PromoCodeRead, status_code=201)
async def create_promo_code(
    payload: PromoCodeCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.create_promo_code(db, admin, payload)


@admin_router.get("", response_model=list[PromoCodeRead])
async def list_promo_codes(db: AsyncSession = Depends(get_db)):
    return await service.list_promo_codes(db)


@admin_router.post("/{promo_code_id}/deactivate", response_model=PromoCodeRead)
async def deactivate_promo_code(promo_code_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await service.deactivate_promo_code(db, promo_code_id)
