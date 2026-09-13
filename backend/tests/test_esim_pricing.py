from decimal import Decimal

from app.modules.esim.pricing import ceil_to_step, compute_price_bdt, data_label


def test_ceil_to_step_rounds_up_to_the_next_multiple():
    assert ceil_to_step(Decimal("101"), 10) == Decimal("110")
    assert ceil_to_step(Decimal("100"), 10) == Decimal("100")  # already exact — no change
    assert ceil_to_step(Decimal("100.01"), 10) == Decimal("110")


def test_ceil_to_step_zero_or_one_still_rounds_up_to_whole_taka():
    assert ceil_to_step(Decimal("100.01"), 0) == Decimal("101")
    assert ceil_to_step(Decimal("100.01"), 1) == Decimal("101")
    assert ceil_to_step(Decimal("100.00"), 1) == Decimal("100")


def test_compute_price_bdt_applies_rate_then_markup_then_rounds_up():
    # cost 4.50 USD * 125 rate = 562.50, +15% markup = 646.875, rounded up to step 10 -> 650
    price = compute_price_bdt(Decimal("4.50"), Decimal("125"), Decimal("15"), 10)
    assert price == Decimal("650.00")


def test_compute_price_bdt_never_sells_below_cost():
    # A pathological near-zero markup must still round up, never down.
    price = compute_price_bdt(Decimal("1.00"), Decimal("100"), Decimal("0.01"), 1)
    assert price >= Decimal("100.00")


def test_compute_price_bdt_keeps_decimal_precision():
    price = compute_price_bdt(Decimal("2.999"), Decimal("123.4567"), Decimal("12.5"), 5)
    assert isinstance(price, Decimal)
    # sanity: 2.999 * 123.4567 * 1.125 ≈ 416.4... rounded up to a multiple of 5
    assert price % Decimal("5") == 0


def test_data_label_unlimited():
    assert data_label(True, 0) == "Unlimited"
    assert data_label(True, 5) == "Unlimited"  # is_unlimited wins even if a stray amount is set
    assert data_label(False, 0) == "Unlimited"  # 0 GB is Triptel's own "unlimited" convention


def test_data_label_finite_amounts_no_trailing_zeros():
    assert data_label(False, 1) == "1 GB"
    assert data_label(False, Decimal("1.0")) == "1 GB"
    assert data_label(False, Decimal("2.5")) == "2.5 GB"
    assert data_label(False, 10) == "10 GB"
