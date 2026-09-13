import pytest

from app.modules.esim.models import EsimOrderStatus
from app.modules.esim.service import decide_triptel_update, is_transition_allowed

S = EsimOrderStatus

ALLOWED_EDGES = {
    (S.PENDING_PAYMENT, S.PAID),
    (S.PENDING_PAYMENT, S.CANCELLED),
    (S.PAID, S.PROVISIONING),
    (S.PAID, S.COMPLETED),
    (S.PAID, S.REFUND_PENDING),
    (S.PROVISIONING, S.COMPLETED),
    (S.PROVISIONING, S.REFUND_PENDING),
    (S.REFUND_PENDING, S.REFUNDED),
}


def test_exactly_the_documented_transitions_are_allowed():
    for current in S:
        for new in S:
            if current == new:
                continue  # covered separately — a repeat is always allowed
            expected = (current, new) in ALLOWED_EDGES
            assert is_transition_allowed(current, new) == expected, f"{current} -> {new}"


def test_repeating_the_current_status_is_always_allowed():
    for status in S:
        assert is_transition_allowed(status, status) is True


@pytest.mark.parametrize(
    "current",
    [S.COMPLETED, S.REFUNDED, S.CANCELLED],
)
def test_terminal_statuses_allow_no_real_transition(current):
    for new in S:
        if new == current:
            continue
        assert is_transition_allowed(current, new) is False


def test_decide_triptel_update_completed():
    payload = {
        "status": "COMPLETED",
        "iccid": "8965...",
        "lpa_string": "LPA:1$smdp.example$ABC",
        "qr_code_data": "LPA:1$smdp.example$ABC",
        "smdp_address": "smdp.example",
        "matching_id": "ABC",
        "install_links": {"ios": "https://x", "android": "https://y"},
    }
    new_status, fields = decide_triptel_update(payload)
    assert new_status == S.COMPLETED
    assert fields["iccid"] == "8965..."
    assert fields["lpa_string"] == "LPA:1$smdp.example$ABC"
    assert fields["install_links"] == {"ios": "https://x", "android": "https://y"}
    assert fields["triptel_status"] == "COMPLETED"
    # No timestamps in the pure decision — the caller stamps those.
    assert "completed_at" not in fields
    assert "last_synced_at" not in fields


def test_decide_triptel_update_failed():
    new_status, fields = decide_triptel_update({"status": "FAILED"})
    assert new_status == S.REFUND_PENDING
    assert fields["failure_reason"] == "The eSIM provider could not issue this eSIM"
    assert fields["triptel_status"] == "FAILED"


def test_decide_triptel_update_processing_is_not_a_status_change():
    new_status, fields = decide_triptel_update({"status": "PROCESSING"})
    assert new_status is None
    assert fields == {"triptel_status": "PROCESSING"}


def test_decide_triptel_update_unknown_status_is_treated_like_processing():
    new_status, fields = decide_triptel_update({"status": "SOMETHING_NEW_FROM_TRIPTEL"})
    assert new_status is None
    assert fields == {"triptel_status": "SOMETHING_NEW_FROM_TRIPTEL"}
