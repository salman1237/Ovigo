"""Phase 9.4 — BusinessType enum, expanded OwnershipType, UNVERIFIED_RECOMMENDATION guard.

Pure-rule tests that don't require a DB connection: enum membership,
schema validation, and the guard logic in service.py are all exercisable
without hitting Postgres.
"""
import pytest
from pydantic import ValidationError

from app.modules.business_network.models import BusinessType, OwnershipType
from app.modules.business_network.schemas import (
    COMMISSION_INELIGIBLE_OWNERSHIP,
    INVITE_ELIGIBLE_OWNERSHIP,
    BusinessReferralCreate,
)


# ── BusinessType enum completeness ──────────────────────────────────────────


def test_business_type_has_all_prd_values():
    expected = {
        "hotel", "resort", "homestay", "guesthouse", "restaurant",
        "local_transport", "rent_a_car", "activity_provider", "photographer",
        "local_product_brand", "equipment_rental", "event_cultural", "other",
    }
    actual = {t.value for t in BusinessType}
    assert actual == expected


def test_business_type_is_str_enum():
    assert BusinessType.HOTEL == "hotel"
    assert BusinessType.LOCAL_TRANSPORT == "local_transport"


# ── OwnershipType enum completeness ─────────────────────────────────────────


def test_ownership_type_has_all_five_values():
    expected = {"owned", "managed", "referred", "partner", "unverified_recommendation"}
    actual = {t.value for t in OwnershipType}
    assert actual == expected


# ── Schema constants ─────────────────────────────────────────────────────────


def test_invite_eligible_is_referred_only():
    assert INVITE_ELIGIBLE_OWNERSHIP == {OwnershipType.REFERRED}


def test_commission_ineligible_is_unverified_recommendation_only():
    assert COMMISSION_INELIGIBLE_OWNERSHIP == {OwnershipType.UNVERIFIED_RECOMMENDATION}


# ── BusinessReferralCreate validation ────────────────────────────────────────


def _valid_payload(**overrides):
    return {
        "business_name": "Sundarbans Guesthouse",
        "business_type": "guesthouse",
        "ownership_type": "owned",
        **overrides,
    }


def test_valid_referral_create():
    r = BusinessReferralCreate(**_valid_payload())
    assert r.business_type == BusinessType.GUESTHOUSE
    assert r.ownership_type == OwnershipType.OWNED
    assert r.business_type_note is None


def test_other_type_requires_note():
    with pytest.raises(ValidationError, match="business_type_note"):
        BusinessReferralCreate(**_valid_payload(business_type="other"))


def test_other_type_with_note_is_valid():
    r = BusinessReferralCreate(**_valid_payload(business_type="other", business_type_note="Bicycle rental"))
    assert r.business_type == BusinessType.OTHER
    assert r.business_type_note == "Bicycle rental"


def test_note_allowed_on_non_other_type():
    # note is optional and allowed on any type (for future internal use)
    r = BusinessReferralCreate(**_valid_payload(business_type="hotel", business_type_note="Traditional hotel"))
    assert r.business_type_note == "Traditional hotel"


def test_invalid_business_type_rejected():
    with pytest.raises(ValidationError):
        BusinessReferralCreate(**_valid_payload(business_type="not_a_real_type"))


def test_invalid_ownership_type_rejected():
    with pytest.raises(ValidationError):
        BusinessReferralCreate(**_valid_payload(ownership_type="god_mode"))


@pytest.mark.parametrize("ownership", ["owned", "managed", "referred", "partner", "unverified_recommendation"])
def test_all_ownership_types_accepted(ownership):
    r = BusinessReferralCreate(**_valid_payload(ownership_type=ownership))
    assert r.ownership_type.value == ownership


# ── Commission-ineligible guard (mirrors service.link_partner logic) ─────────


def test_unverified_recommendation_is_commission_ineligible():
    assert OwnershipType.UNVERIFIED_RECOMMENDATION in COMMISSION_INELIGIBLE_OWNERSHIP


def test_owned_managed_referred_partner_are_commission_eligible():
    for ot in (OwnershipType.OWNED, OwnershipType.MANAGED, OwnershipType.REFERRED, OwnershipType.PARTNER):
        assert ot not in COMMISSION_INELIGIBLE_OWNERSHIP


# ── Invite-eligible guard ─────────────────────────────────────────────────────


def test_only_referred_can_generate_invite():
    assert OwnershipType.REFERRED in INVITE_ELIGIBLE_OWNERSHIP
    for ot in (OwnershipType.OWNED, OwnershipType.MANAGED, OwnershipType.PARTNER, OwnershipType.UNVERIFIED_RECOMMENDATION):
        assert ot not in INVITE_ELIGIBLE_OWNERSHIP
