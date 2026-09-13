"""Async client for Triptel's Partner Reseller API (`TRIPTEL_PARTNER_API.md` at the
repo root is the source of truth for every shape used here). A small dedicated
`httpx.AsyncClient` per call, not the shared app client — this module's retry/auth
concerns are specific to one third-party integration.

**Token caching:** a module-level access token + expiry, guarded by an `asyncio.Lock`
so concurrent requests don't each fetch their own token. Renewed proactively when
fewer than 5 minutes remain, and force-renewed exactly once if any call returns 401
(then that one call is retried with the fresh token).

**Retries:** `GET` requests and `POST /orders` (safe only because it always carries
`customer_reference`, see TRIPTEL_PARTNER_API.md §2.4) retry up to 3 times on a
network error or 5xx, backing off 0.5s/1s/2s. No other 4xx is ever retried, and a 401
retry doesn't consume this budget — it's a separate, one-shot mechanism.

**Errors:** every failure raises `TriptelError` (an `AppError`) with `status_code=502`
towards our own API callers (a Triptel problem is *our* upstream dependency failing,
not the traveler's fault) — but `upstream_status`/`upstream_detail` are kept on the
exception so `service.py` can still branch on "insufficient balance" (400) vs.
"product gone" (404) vs. "everything else". The API key never appears in any raised
message.
"""
import asyncio
import time

import httpx

from app.config import get_settings
from app.core.exceptions import AppError

_RETRY_BACKOFFS = [0.5, 1.0, 2.0]
_TOKEN_RENEW_MARGIN_SECONDS = 300

_token: str | None = None
_token_expires_at: float = 0.0
_token_lock = asyncio.Lock()


class TriptelError(AppError):
    def __init__(
        self,
        message: str,
        status_code: int = 502,
        upstream_status: int | None = None,
        upstream_detail: str | None = None,
    ):
        super().__init__(message, status_code)
        self.upstream_status = upstream_status
        self.upstream_detail = upstream_detail


def _require_configured() -> None:
    if not get_settings().triptel_configured:
        raise TriptelError("eSIM service is not available", status_code=503)


async def _fetch_token(client: httpx.AsyncClient) -> str:
    settings = get_settings()
    response = await client.post(f"{settings.triptel_api_base_url}/auth/token", json={"api_key": settings.triptel_api_key})
    if response.status_code != 200:
        raise TriptelError(
            "Could not authenticate with the eSIM provider", upstream_status=response.status_code
        )
    data = response.json()
    return data["access_token"], data.get("expires_in", 3600)


async def _get_token(client: httpx.AsyncClient, force: bool = False) -> str:
    global _token, _token_expires_at
    now = time.monotonic()
    if not force and _token and _token_expires_at - now > _TOKEN_RENEW_MARGIN_SECONDS:
        return _token
    async with _token_lock:
        now = time.monotonic()
        if not force and _token and _token_expires_at - now > _TOKEN_RENEW_MARGIN_SECONDS:
            return _token
        token, expires_in = await _fetch_token(client)
        _token = token
        _token_expires_at = now + expires_in
        return _token


def _extract_detail(response: httpx.Response) -> str:
    try:
        return str(response.json().get("detail", response.text))
    except ValueError:
        return response.text


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code >= 400:
        raise TriptelError(
            f"eSIM provider error: {_extract_detail(response)}",
            upstream_status=response.status_code,
            upstream_detail=_extract_detail(response)[:500],
        )


async def _call(
    method: str, path: str, *, params: dict | None = None, json_body: dict | None = None, allow_retry: bool = True
) -> httpx.Response:
    _require_configured()
    settings = get_settings()
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        token = await _get_token(client)
        renewed_after_401 = False
        attempt = 0
        while True:
            try:
                response = await client.request(
                    method,
                    f"{settings.triptel_api_base_url}{path}",
                    params=params,
                    json=json_body,
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as exc:
                if allow_retry and attempt < len(_RETRY_BACKOFFS):
                    await asyncio.sleep(_RETRY_BACKOFFS[attempt])
                    attempt += 1
                    continue
                raise TriptelError(f"Could not reach the eSIM provider: {exc}") from exc

            if response.status_code == 401 and not renewed_after_401:
                renewed_after_401 = True
                token = await _get_token(client, force=True)
                continue

            if response.status_code >= 500 and allow_retry and attempt < len(_RETRY_BACKOFFS):
                await asyncio.sleep(_RETRY_BACKOFFS[attempt])
                attempt += 1
                continue

            return response


async def list_countries(search: str | None = None) -> list[dict]:
    response = await _call("GET", "/countries", params={"search": search} if search else None)
    _raise_for_status(response)
    return response.json()


async def list_products(iso2: str) -> list[dict]:
    response = await _call("GET", f"/countries/{iso2}/products")
    if response.status_code == 404:
        raise TriptelError("Country not found", status_code=404, upstream_status=404)
    _raise_for_status(response)
    return response.json()


async def get_account() -> dict:
    response = await _call("GET", "/me")
    _raise_for_status(response)
    return response.json()


async def create_order(product_id: str, customer_reference: str) -> dict:
    """Always carries `customer_reference` — this is what makes retrying this POST
    safe (see module docstring and TRIPTEL_PARTNER_API.md §2.4)."""
    response = await _call(
        "POST", "/orders", json_body={"product_id": product_id, "customer_reference": customer_reference}, allow_retry=True
    )
    if response.status_code in (400, 404, 409):
        raise TriptelError(
            f"Order rejected: {_extract_detail(response)}",
            upstream_status=response.status_code,
            upstream_detail=_extract_detail(response)[:500],
        )
    _raise_for_status(response)
    return response.json()


async def get_order(order_id: str) -> dict:
    response = await _call("GET", f"/orders/{order_id}")
    if response.status_code == 404:
        raise TriptelError("Order not found at the eSIM provider", status_code=404, upstream_status=404)
    _raise_for_status(response)
    return response.json()


async def find_order_by_reference(customer_reference: str) -> dict | None:
    response = await _call("GET", "/orders", params={"customer_reference": customer_reference, "limit": 1})
    _raise_for_status(response)
    orders = response.json().get("orders", [])
    return orders[0] if orders else None


async def set_webhook(url: str | None) -> dict:
    """Not auto-retried: a lost response to a successful PUT would otherwise rotate
    the webhook secret a second time on retry (see TRIPTEL_PARTNER_API.md §2.7).
    Called only from the one-shot `scripts/configure_triptel_webhook.py`."""
    response = await _call("PUT", "/webhook-config", json_body={"webhook_url": url}, allow_retry=False)
    _raise_for_status(response)
    return response.json()
