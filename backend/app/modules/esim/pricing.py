"""Pure pricing math — no I/O, fully unit-testable without a database.
`Decimal` throughout; never `float`, for the same reason every other money field in
this codebase uses it (see bookings/models.py's module docstring).
"""
from decimal import ROUND_CEILING, Decimal


def ceil_to_step(value: Decimal, step_bdt: int) -> Decimal:
    """Rounds `value` UP to the next multiple of `step_bdt` — Ovigo must never sell
    an eSIM below cost, so this always rounds away from zero regardless of how close
    `value` already is to a multiple. A step of 0 or 1 means "round up to a whole
    taka" (no sub-unit BDT amounts are ever charged)."""
    step = Decimal(max(step_bdt, 1))
    return (value / step).to_integral_value(rounding=ROUND_CEILING) * step


def compute_price_bdt(cost_usd: Decimal, usd_to_bdt_rate: Decimal, markup_pct: Decimal, rounding_step_bdt: int) -> Decimal:
    """price_bdt = ceil_to_step(cost_usd * usd_to_bdt_rate * (1 + markup_pct / 100), rounding_step_bdt)"""
    raw = cost_usd * usd_to_bdt_rate * (Decimal("1") + markup_pct / Decimal("100"))
    return ceil_to_step(raw, rounding_step_bdt).quantize(Decimal("0.01"))


def data_label(is_unlimited: bool, data_amount_gb: Decimal | float | int) -> str:
    """"Unlimited" when the plan is flagged unlimited or the amount is 0 (Triptel's
    own convention for unlimited plans — see TRIPTEL_PARTNER_API.md §2.2), otherwise
    "{amount} GB" with no trailing zeros (e.g. "1 GB", "2.5 GB", not "1.0 GB")."""
    amount = Decimal(str(data_amount_gb))
    if is_unlimited or amount == 0:
        return "Unlimited"
    normalized = amount.normalize()
    # Decimal.normalize() can produce scientific notation for whole numbers (e.g. 1E+1
    # for 10) — format explicitly instead of trusting str(normalized).
    text = format(normalized, "f")
    return f"{text} GB"
