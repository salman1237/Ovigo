from fastapi import APIRouter

from app.core import fx
from app.modules.fx.schemas import FxRatesRead

router = APIRouter(prefix="/api/v1/fx", tags=["fx"])


@router.get("/rates", response_model=FxRatesRead)
async def get_rates():
    return FxRatesRead(rates=await fx.get_bdt_rates())
