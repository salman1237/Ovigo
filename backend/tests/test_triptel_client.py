import json

import httpx
import pytest

from app.core.exceptions import AppError
from app.modules.esim import triptel_client as tc

FAKE_API_KEY = "esim_live_super_secret_test_key"


class _FakeSettings:
    triptel_configured = True
    triptel_api_base_url = "https://fake.triptel.test/api/v1/partner"
    triptel_api_key = FAKE_API_KEY


@pytest.fixture(autouse=True)
def reset_token_cache_and_settings(monkeypatch):
    """Every test starts with a clean token cache and a fake, always-configured
    settings object — none of this touches the real database or network."""
    tc._token = None
    tc._token_expires_at = 0.0
    monkeypatch.setattr(tc, "get_settings", lambda: _FakeSettings())

    async def _no_sleep(_seconds):
        return None

    monkeypatch.setattr(tc.asyncio, "sleep", _no_sleep)
    yield
    tc._token = None
    tc._token_expires_at = 0.0


def install_mock_transport(monkeypatch, handler):
    real_async_client = httpx.AsyncClient  # capture before patching — the factory
    # below must not call through the (about to be) patched httpx.AsyncClient itself.

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(tc.httpx, "AsyncClient", factory)


def _token_response(token: str = "tok") -> httpx.Response:
    return httpx.Response(200, json={"access_token": token, "token_type": "bearer", "expires_in": 3600})


async def test_token_is_fetched_once_and_reused(monkeypatch):
    token_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal token_calls
        if request.url.path.endswith("/auth/token"):
            token_calls += 1
            return _token_response()
        return httpx.Response(200, json=[])

    install_mock_transport(monkeypatch, handler)
    await tc.list_countries()
    await tc.list_countries()
    assert token_calls == 1


async def test_token_renewed_near_expiry(monkeypatch):
    import time

    token_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal token_calls
        if request.url.path.endswith("/auth/token"):
            token_calls += 1
            return _token_response(f"tok{token_calls}")
        return httpx.Response(200, json=[])

    install_mock_transport(monkeypatch, handler)
    await tc.list_countries()
    assert token_calls == 1

    # Fewer than 5 minutes left -> the next call must renew proactively.
    tc._token_expires_at = time.monotonic() + 100
    await tc.list_countries()
    assert token_calls == 2


async def test_401_triggers_exactly_one_renewal_and_retry(monkeypatch):
    token_calls = 0
    countries_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal token_calls, countries_calls
        if request.url.path.endswith("/auth/token"):
            token_calls += 1
            return _token_response(f"tok{token_calls}")
        countries_calls += 1
        if countries_calls == 1:
            return httpx.Response(401, json={"detail": "token expired"})
        return httpx.Response(200, json=[{"iso2": "SG"}])

    install_mock_transport(monkeypatch, handler)
    result = await tc.list_countries()
    assert result == [{"iso2": "SG"}]
    assert countries_calls == 2
    assert token_calls == 2  # initial fetch + one forced renewal after the 401


async def test_5xx_get_is_retried_then_succeeds(monkeypatch):
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        if request.url.path.endswith("/auth/token"):
            return _token_response()
        attempts += 1
        if attempts < 3:
            return httpx.Response(503)
        return httpx.Response(200, json=[])

    install_mock_transport(monkeypatch, handler)
    result = await tc.list_countries()
    assert result == []
    assert attempts == 3


async def test_4xx_get_is_not_retried(monkeypatch):
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        if request.url.path.endswith("/auth/token"):
            return _token_response()
        attempts += 1
        return httpx.Response(404, json={"detail": "not found"})

    install_mock_transport(monkeypatch, handler)
    with pytest.raises(AppError):
        await tc.list_countries()
    assert attempts == 1


async def test_create_order_always_sends_customer_reference(monkeypatch):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/token"):
            return _token_response()
        if request.url.path.endswith("/orders"):
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json={"order_id": "o1", "order_no": "PTR-1", "status": "PROCESSING"})
        return httpx.Response(404)

    install_mock_transport(monkeypatch, handler)
    await tc.create_order("prod-123", "my-reference-456")
    assert captured["body"] == {"product_id": "prod-123", "customer_reference": "my-reference-456"}


async def test_create_order_is_retried_on_5xx_because_reference_makes_it_safe(monkeypatch):
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        if request.url.path.endswith("/auth/token"):
            return _token_response()
        if request.url.path.endswith("/orders"):
            attempts += 1
            if attempts < 2:
                return httpx.Response(502)
            return httpx.Response(200, json={"order_id": "o1", "status": "PROCESSING"})
        return httpx.Response(404)

    install_mock_transport(monkeypatch, handler)
    result = await tc.create_order("prod-123", "ref-1")
    assert result["order_id"] == "o1"
    assert attempts == 2


async def test_api_key_never_appears_in_a_raised_error_message(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/auth/token"):
            # Even if the upstream error body echoed the key back, our own error
            # message must not repeat it — _fetch_token never forwards upstream detail.
            return httpx.Response(401, json={"detail": f"invalid api_key {FAKE_API_KEY}"})
        return httpx.Response(200, json=[])

    install_mock_transport(monkeypatch, handler)
    with pytest.raises(AppError) as exc_info:
        await tc.list_countries()
    assert FAKE_API_KEY not in str(exc_info.value)
    assert FAKE_API_KEY not in repr(exc_info.value)
