from fastapi import APIRouter, Query, Request

from app.core.rate_limit import limiter
from app.modules.geocoding import service

router = APIRouter(prefix="/api/v1/geocode", tags=["geocoding"])


@router.get("/search")
@limiter.limit("20/minute")
async def search(request: Request, q: str = Query(min_length=2, max_length=200)) -> list[dict]:
    return await service.search(q)


@router.get("/reverse")
@limiter.limit("20/minute")
async def reverse(request: Request, lat: float, lng: float) -> dict:
    return await service.reverse(lat, lng)
