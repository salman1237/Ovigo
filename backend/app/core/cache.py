"""Minimal in-process TTL cache for read-heavy, slow-changing endpoints (the
locations hierarchy, the destinations list) — not a general caching layer.

In-memory only: fine for FastAPI Cloud's single instance today. If this ever runs
behind multiple instances, cached responses would go stale independently per
instance (still bounded by the TTL, just not synchronized) — moving to Redis
would fix that, but isn't worth the operational cost at Phase 1's traffic.

Invalidation is TTL-only, not event-driven — admin edits to locations take up to
`ttl_seconds` to show up. That's an acceptable trade for data that changes rarely
(new destinations are an admin operation, not a per-request one).
"""
import time
from functools import wraps
from typing import Any, Callable


class _Entry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, expires_at: float):
        self.value = value
        self.expires_at = expires_at


_store: dict[str, _Entry] = {}


def cached(key: str, ttl_seconds: int):
    """Decorator for an async endpoint/service function with no arguments that
    affect the result (or whose result is safe to share across all callers) —
    caches the return value in-process for `ttl_seconds`."""

    def decorator(fn: Callable):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            entry = _store.get(key)
            now = time.monotonic()
            if entry is not None and entry.expires_at > now:
                return entry.value
            result = await fn(*args, **kwargs)
            _store[key] = _Entry(result, now + ttl_seconds)
            return result

        return wrapper

    return decorator


def invalidate(key: str) -> None:
    _store.pop(key, None)
