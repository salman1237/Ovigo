"""Phase 9.6 — Tour auto-approval (trusted expert) and high-risk moderation.

Pure-rule tests that don't require a DB connection.
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


# ── LocalExpertProfile.is_trusted field ─────────────────────────────────────


def test_local_expert_profile_has_is_trusted_field():
    from app.modules.profiles.models import LocalExpertProfile
    assert hasattr(LocalExpertProfile, "is_trusted"), "LocalExpertProfile must have an is_trusted column"


def test_local_expert_profile_is_trusted_defaults_falsy():
    from app.modules.profiles.models import LocalExpertProfile
    profile = LocalExpertProfile()
    # Python default is None (DB server_default=false applies on INSERT);
    # what matters is that it is falsy — never True before an admin sets it.
    assert not profile.is_trusted


# ── AdminTourRead schema includes new fields ─────────────────────────────────


def test_admin_tour_read_has_has_high_risk_activities():
    from app.modules.admin.schemas import AdminTourRead
    assert "has_high_risk_activities" in AdminTourRead.model_fields
    assert AdminTourRead.model_fields["has_high_risk_activities"].default is False


def test_admin_tour_read_has_expert_is_trusted():
    from app.modules.admin.schemas import AdminTourRead
    assert "expert_is_trusted" in AdminTourRead.model_fields
    assert AdminTourRead.model_fields["expert_is_trusted"].default is False


# ── ApproveTourRequest schema ─────────────────────────────────────────────────


def test_approve_tour_request_safety_checklist_defaults_false():
    from app.modules.admin.schemas import ApproveTourRequest
    req = ApproveTourRequest()
    assert req.safety_checklist_confirmed is False


def test_approve_tour_request_accepts_true():
    from app.modules.admin.schemas import ApproveTourRequest
    req = ApproveTourRequest(safety_checklist_confirmed=True)
    assert req.safety_checklist_confirmed is True


# ── High-risk detection ──────────────────────────────────────────────────────


def test_high_risk_activity_detection():
    """Tours with any is_high_risk activity flag True are high-risk."""
    mock_activity_safe = MagicMock(is_high_risk=False)
    mock_activity_risky = MagicMock(is_high_risk=True)

    safe_activities = [mock_activity_safe, mock_activity_safe]
    risky_activities = [mock_activity_safe, mock_activity_risky]

    assert not any(a.is_high_risk for a in safe_activities)
    assert any(a.is_high_risk for a in risky_activities)


def test_high_risk_empty_activities():
    assert not any(a.is_high_risk for a in [])


# ── Auto-approval eligibility rules ──────────────────────────────────────────


def _auto_approves(is_trusted: bool, has_high_risk: bool) -> bool:
    """Mirrors the logic in tours/service.py::submit_for_review."""
    return is_trusted and not has_high_risk


@pytest.mark.parametrize("is_trusted,has_high_risk,expected", [
    (True, False, True),   # trusted + safe → auto-approve
    (True, True, False),   # trusted + high-risk → manual review always
    (False, False, False), # untrusted + safe → manual review
    (False, True, False),  # untrusted + high-risk → manual review
])
def test_auto_approval_eligibility(is_trusted, has_high_risk, expected):
    assert _auto_approves(is_trusted, has_high_risk) == expected


# ── Safety checklist gate ─────────────────────────────────────────────────────


def _should_block_approval(has_high_risk: bool, checklist_confirmed: bool) -> bool:
    """Mirrors admin/service.py::approve_tour safety check."""
    return has_high_risk and not checklist_confirmed


@pytest.mark.parametrize("has_high_risk,confirmed,should_block", [
    (True, False, True),   # high-risk without checklist → blocked
    (True, True, False),   # high-risk with checklist → allowed
    (False, False, False), # safe without checklist → allowed
    (False, True, False),  # safe with checklist → allowed (no-op)
])
def test_safety_checklist_gate(has_high_risk, confirmed, should_block):
    assert _should_block_approval(has_high_risk, confirmed) == should_block


# ── Migration revision exists ─────────────────────────────────────────────────


def test_migration_file_exists():
    import pathlib
    migrations_dir = pathlib.Path(__file__).parent.parent / "migrations" / "versions"
    files = list(migrations_dir.glob("*is_trusted*"))
    assert files, "Migration file for is_trusted should exist"
