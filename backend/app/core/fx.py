"""Live currency-conversion rates for display only (technical document Sprint
25-26: "Multi-currency support"). Every booking is still charged and settled in
BDT via SSLCommerz (see bookings/models.py's module docstring) — SSLCommerz is a
Bangladesh-focused gateway with no real multi-currency settlement path, and there's
no Stripe/other gateway credential configured to change that (the same "provider
not configured" gap already documented elsewhere in this codebase). This exists
purely so a traveler browsing in a foreign currency sees an approximate price
alongside the real BDT amount — an "approx. $X" hint, never the charged amount.

Uses open.er-api.com: genuinely free, keyless, and — unlike some FX APIs (e.g.
Frankfurter, which only tracks ECB-listed currencies) — actually supports BDT as
a base currency. Cached for 6 hours via core/cache.py since exchange rates don't
need to be byte-fresh for an informational display, and hammering a free public
API on every page view would be poor citizenship.
"""
import httpx

from app.core.cache import cached

FX_API_URL = "https://open.er-api.com/v6/latest/BDT"

# A representative set of currencies Ovigo's travelers (Bangladeshi outbound +
# South/Southeast Asian inbound) are most likely to think in — not every
# currency the upstream API returns.
SUPPORTED_DISPLAY_CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SAR", "MYR", "SGD", "AUD", "CAD"]


@cached("fx:bdt-rates", ttl_seconds=6 * 60 * 60)
async def get_bdt_rates() -> dict[str, float]:
    """1 BDT = rates[code] units of that currency. Returns {} on any failure
    (network, upstream outage, ...) rather than raising — a missing rate just
    means the frontend skips the approx-price hint, not a broken page."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(FX_API_URL)
            response.raise_for_status()
        all_rates = response.json().get("rates", {})
    except (httpx.HTTPError, ValueError):
        return {}
    return {code: all_rates[code] for code in SUPPORTED_DISPLAY_CURRENCIES if code in all_rates}
