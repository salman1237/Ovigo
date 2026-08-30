"""Rate limiting, keyed by client IP (slowapi/limits, in-memory storage).

In-memory storage is fine for a single FastAPI Cloud instance; if this ever runs
behind multiple instances the storage backend should move to Redis (`limits`
supports it via a connection string) so limits are shared across processes.

Applied narrowly to the endpoints that matter most for abuse (auth: login,
register, OTP) rather than globally, so normal browsing traffic is never
affected by a limit tuned for credential-stuffing/spam protection.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
