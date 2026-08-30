"""Thin client for SSLCommerz's session-initiation and validation APIs.
Docs: https://sandbox-gw.sslcommerz.com/docs — sandbox and live share the same
request/response shape, only the base URLs differ (see config.py).

Verified against the real sandbox during development: session initiation returns
{"status": "SUCCESS", "sessionkey": ..., "GatewayPageURL": ...}, and the validation
API returns {"status": "INVALID_TRANSACTION", ...} for an unknown val_id — matching
the documented contract exactly.
"""
import httpx

from app.config import get_settings
from app.core.exceptions import AppError

settings = get_settings()


class SSLCommerzError(AppError):
    def __init__(self, message: str):
        super().__init__(message, status_code=502)


async def initiate_session(
    *,
    tran_id: str,
    amount: str,
    success_url: str,
    fail_url: str,
    cancel_url: str,
    ipn_url: str,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
) -> dict:
    if not settings.sslcommerz_configured:
        raise SSLCommerzError("Payment gateway is not configured")

    data = {
        "store_id": settings.sslcommerz_store_id,
        "store_passwd": settings.sslcommerz_store_passwd,
        "total_amount": amount,
        "currency": "BDT",
        "tran_id": tran_id,
        "success_url": success_url,
        "fail_url": fail_url,
        "cancel_url": cancel_url,
        "ipn_url": ipn_url,
        "cus_name": customer_name,
        "cus_email": customer_email,
        "cus_add1": "N/A",
        "cus_city": "Dhaka",
        "cus_postcode": "1000",
        "cus_country": "Bangladesh",
        "cus_phone": customer_phone or "N/A",
        "shipping_method": "NO",
        "product_name": "Ovigo Booking",
        "product_category": "Travel",
        "product_profile": "general",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(settings.sslcommerz_api_url, data=data)

    if response.status_code != 200:
        raise SSLCommerzError(f"Gateway returned HTTP {response.status_code}")

    result = response.json()
    if result.get("status") != "SUCCESS":
        raise SSLCommerzError(result.get("failedreason") or "Session initiation failed")
    return result


async def validate_transaction(val_id: str) -> dict:
    if not settings.sslcommerz_configured:
        raise SSLCommerzError("Payment gateway is not configured")

    params = {
        "val_id": val_id,
        "store_id": settings.sslcommerz_store_id,
        "store_passwd": settings.sslcommerz_store_passwd,
        "format": "json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(settings.sslcommerz_validation_url, params=params)

    if response.status_code != 200:
        raise SSLCommerzError(f"Validation API returned HTTP {response.status_code}")
    return response.json()
