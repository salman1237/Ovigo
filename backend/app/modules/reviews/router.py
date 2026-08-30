import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.reviews import service
from app.modules.reviews.schemas import ReviewCreate, ReviewRead
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])


@router.post("", response_model=ReviewRead, status_code=201)
async def create_review(
    payload: ReviewCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await service.create_review(db, current_user, payload)


@router.get("", response_model=list[ReviewRead])
async def list_reviews(
    tour_id: uuid.UUID | None = None,
    property_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    if tour_id:
        return await service.list_for_tour(db, tour_id)
    if property_id:
        return await service.list_for_property(db, property_id)
    return []
