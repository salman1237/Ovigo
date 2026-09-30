"""Thin proxy in front of Nominatim (OpenStreetMap's free geocoder), used by the
rent-a-car ride-request map picker (LocationMapPicker.tsx) to turn a typed search
or a clicked/GPS point into a human-readable label. Never called directly from the
browser: Nominatim's usage policy requires an identifying User-Agent and roughly
one request per second, which is much easier to guarantee centrally, server-side,
than to trust every client to respect.

A short in-memory cache absorbs repeated identical lookups within one interactive
session (e.g. a user nudging a pin back and forth). It's a plain dict, not Redis —
same "no Redis instance provisioned yet" situation noted in bookings/service.py's
module docstring; fine for this low-stakes, short-TTL use.
"""
import asyncio
import time

import httpx

from app.core.exceptions import AppError

_BASE_URL = "https://nominatim.openstreetmap.org"
_USER_AGENT = "Ovigo/1.0 (contact@ovigo.example)"
_MIN_INTERVAL_SECONDS = 1.0
_CACHE_TTL_SECONDS = 300

_last_call_at: float = 0.0
_call_lock = asyncio.Lock()
_cache: dict[str, tuple[float, object]] = {}


class GeocodingError(AppError):
    def __init__(self, message: str = "Location lookup is temporarily unavailable"):
        super().__init__(message, status_code=502)


def _cache_get(key: str) -> object | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    cached_at, value = entry
    if time.monotonic() - cached_at > _CACHE_TTL_SECONDS:
        del _cache[key]
        return None
    return value


def _cache_set(key: str, value: object) -> None:
    _cache[key] = (time.monotonic(), value)
    if len(_cache) > 500:  # simple unbounded-growth guard, not a real LRU
        oldest_key = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest_key]


async def _throttled_get(endpoint: str, params: dict):
    global _last_call_at
    async with _call_lock:
        wait = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_call_at)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(
                    f"{_BASE_URL}/{endpoint}", params=params, headers={"User-Agent": _USER_AGENT}
                )
        except httpx.HTTPError:
            raise GeocodingError()
        finally:
            _last_call_at = time.monotonic()
    if response.status_code != 200:
        raise GeocodingError()
    return response.json()


async def search(q: str) -> list[dict]:
    key = f"search:{q.strip().lower()}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    data: list[dict] = await _throttled_get("search", {"q": q, "format": "jsonv2", "limit": 5, "countrycodes": "bd"})
    results = [
        {"label": item["display_name"], "lat": float(item["lat"]), "lng": float(item["lon"])} for item in data
    ]
    _cache_set(key, results)
    return results


async def reverse(lat: float, lng: float) -> dict:
    key = f"reverse:{round(lat, 5)}:{round(lng, 5)}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    data: dict = await _throttled_get("reverse", {"lat": lat, "lon": lng, "format": "jsonv2"})
    label = data.get("display_name") if isinstance(data, dict) else None
    result = {"label": label or f"{lat:.5f}, {lng:.5f}", "lat": lat, "lng": lng}
    _cache_set(key, result)
    return result
