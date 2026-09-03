from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.utils import get_current_user
from app.modules.loyalty import service
from app.modules.loyalty.schemas import LoyaltyAccountRead, LoyaltyTransactionRead
from app.modules.users.models import User

router = APIRouter(prefix="/api/v1/loyalty", tags=["loyalty"])


@router.get("/me", response_model=LoyaltyAccountRead)
async def get_my_loyalty_account(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.get_account_read(db, user)


@router.get("/transactions", response_model=list[LoyaltyTransactionRead])
async def list_my_loyalty_transactions(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_transactions(db, user)
