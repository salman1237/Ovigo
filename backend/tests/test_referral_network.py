"""Phase 9.1 — expert referral link & network attribution.

Two layers:
- Pure-rule unit tests, always run.
- End-to-end API + commission-engine tests against a real Postgres, run only when
  OVIGO_DB_TESTS=1 (CI provides a Postgres service for this; locally, point
  DATABASE_URL at a throwaway database). The schema is created from the models
  rather than by replaying migrations, since the historical migration chain isn't
  replayable onto an empty database (an early enum migration adds and uses a
  value in one transaction).
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.modules.referrals import service as referrals_service
from app.modules.referrals.models import AttributionStatus, NetworkAttribution

UTC = timezone.utc


# --- Pure rules ---


def test_code_alphabet_is_unambiguous_and_codes_have_fixed_length():
    for ch in "01OILU":
        assert ch not in referrals_service.CODE_ALPHABET
    codes = {referrals_service.generate_code() for _ in range(200)}
    assert all(len(c) == referrals_service.CODE_LENGTH for c in codes)
    assert all(set(c) <= set(referrals_service.CODE_ALPHABET) for c in codes)
    assert len(codes) == 200  # no collisions in a small sample


def test_normalize_code_accepts_what_people_type():
    assert referrals_service.normalize_code(" k7q2-m9xd ") == "K7Q2M9XD"
    assert referrals_service.normalize_code("") is None
    assert referrals_service.normalize_code(None) is None


def test_add_months_clamps_to_month_end():
    assert referrals_service.add_months(datetime(2026, 1, 31, tzinfo=UTC), 1) == datetime(2026, 2, 28, tzinfo=UTC)
    assert referrals_service.add_months(datetime(2026, 10, 4, tzinfo=UTC), 12) == datetime(2027, 10, 4, tzinfo=UTC)
    assert referrals_service.add_months(datetime(2026, 3, 15, tzinfo=UTC), -12) == datetime(2025, 3, 15, tzinfo=UTC)


def _attribution(status=AttributionStatus.ACTIVE, starts=None, expires=None):
    return NetworkAttribution(status=status, commission_starts_at=starts, commission_expires_at=expires)


def test_is_earning_respects_status_and_window():
    now = datetime(2026, 10, 4, tzinfo=UTC)
    start, end = now - timedelta(days=10), now + timedelta(days=10)
    assert referrals_service.is_earning(_attribution(starts=start, expires=end), now)
    assert not referrals_service.is_earning(_attribution(starts=start, expires=end), start - timedelta(seconds=1))
    assert not referrals_service.is_earning(_attribution(starts=start, expires=end), end)  # expiry is exclusive
    assert not referrals_service.is_earning(_attribution(status=AttributionStatus.PENDING, starts=start, expires=end), now)
    assert not referrals_service.is_earning(_attribution(status=AttributionStatus.REVOKED, starts=start, expires=end), now)
    assert not referrals_service.is_earning(_attribution(starts=None, expires=end), now)


def test_effective_status_reports_expired_active_rows():
    now = datetime(2026, 10, 4, tzinfo=UTC)
    assert referrals_service.effective_status(_attribution(expires=now - timedelta(days=1)), now) == "expired"
    assert referrals_service.effective_status(_attribution(expires=now + timedelta(days=1)), now) == "active"
    assert referrals_service.effective_status(_attribution(status=AttributionStatus.PENDING), now) == "pending"


def test_local_expert_role_is_not_joinable():
    from app.modules.users.models import PartnerRoleType

    assert PartnerRoleType.LOCAL_EXPERT not in referrals_service.JOINABLE_ROLE_TYPES
    assert set(referrals_service.JOINABLE_ROLE_TYPES) == {
        PartnerRoleType.GUIDE, PartnerRoleType.HOST, PartnerRoleType.HOTEL, PartnerRoleType.RENT_A_CAR
    }


# --- End-to-end against a real database ---

from tests.db_helpers import (  # noqa: E402
    admin_token as _admin_token,
    apply as _apply,
    approved_expert as _approved_expert,
    auth as _auth,
    commissions_for_item as _commissions_for_item,
    db_tests,
    register as _register,
    session as _session,
)


async def _book_and_commission(booker_user_id: str, partner_role_id: str, subtotal: Decimal, monkeypatch):
    """A paid booking for one room-type item of `partner_role_id`, run through the
    real commission engine. The partner lookup is pinned (it's not under test here —
    it needs a full property/room fixture); everything after it is the real code."""
    from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType, BookingStatus
    from app.modules.commissions import service as commissions_service

    async def _pinned(db, item):
        return uuid.UUID(partner_role_id)

    monkeypatch.setattr(commissions_service, "_partner_role_for_item", _pinned)
    async with await _session() as db:
        booking = Booking(
            user_id=uuid.UUID(booker_user_id), status=BookingStatus.CONFIRMED, total_amount=subtotal, currency="BDT"
        )
        booking.items = [
            BookingItem(
                item_type=BookingItemType.ROOM_TYPE, status=BookingItemStatus.CONFIRMED,
                quantity=1, unit_price=subtotal, subtotal=subtotal,
            )
        ]
        db.add(booking)
        await db.flush()
        await db.refresh(booking, ["created_at"])
        await commissions_service.create_commissions_for_booking(db, booking)
        await db.commit()
        return booking.items[0].id


@db_tests
async def test_host_joins_through_link_and_expert_earns_network_commission(api, monkeypatch):
    admin = await _admin_token(api)
    expert_token, expert_user, expert_role_id = await _approved_expert(api, admin)

    # The expert's link is created on first view and stable afterwards.
    r = await api.get("/api/v1/referrals/me", headers=_auth(expert_token))
    assert r.status_code == 200, r.text
    link = r.json()
    assert len(link["code"]) == 8 and link["url"].endswith(f"/join/{link['code']}")
    assert set(link["role_urls"]) == {"guide", "host", "hotel", "rent_a_car"}
    assert (await api.get("/api/v1/referrals/me", headers=_auth(expert_token))).json()["code"] == link["code"]

    # Public landing info; only the landing page itself counts a visit.
    r = await api.get(f"/api/v1/referrals/links/{link['code'].lower()}?count_visit=true")
    assert r.status_code == 200 and r.json()["expert_name"] == "Expert Karim"
    await api.get(f"/api/v1/referrals/links/{link['code']}")
    assert (await api.get("/api/v1/referrals/links/ZZZZZZZZ")).status_code == 404

    # Prospect registers through the link; the invite survives without the code.
    host_token, host_user = await _register(api, "Host Rahim", referral_code=link["code"])
    r = await api.get("/api/v1/referrals/invite", headers=_auth(host_token))
    assert r.status_code == 200 and r.json()["expert_name"] == "Expert Karim"

    # Terms are required when a code is sent explicitly.
    r = await _apply(api, host_token, "host", referral_code=link["code"])
    assert r.status_code == 409 and "terms" in r.json()["detail"]
    r = await _apply(api, host_token, "host", referral_code=link["code"], accept_network_terms=True)
    assert r.status_code == 201, r.text
    host_role_id = r.json()["id"]

    r = await api.get("/api/v1/referrals/me/members", headers=_auth(expert_token))
    members = r.json()
    assert len(members) == 1 and members[0]["status"] == "pending" and members[0]["member_name"] == "Host Rahim"

    notes = (await api.get("/api/v1/notifications", headers=_auth(expert_token))).json()
    note_items = notes["items"] if isinstance(notes, dict) else notes
    assert any(n["type"] == "network_member_joined" for n in note_items)

    # Admin approval activates a 12-month window.
    r = await api.post(f"/api/v1/admin/partners/roles/{host_role_id}/approve", headers=_auth(admin))
    assert r.status_code == 200, r.text
    member = (await api.get("/api/v1/referrals/me/members", headers=_auth(expert_token))).json()[0]
    assert member["status"] == "active" and member["role_approved"]
    starts = datetime.fromisoformat(member["commission_starts_at"])
    expires = datetime.fromisoformat(member["commission_expires_at"])
    assert 364 <= (expires - starts).days <= 366

    # A traveler's booking: DIRECT for the host (unchanged net) + NETWORK for the expert.
    _, traveler = await _register(api, "Traveler Nadia")
    item_id = await _book_and_commission(traveler["id"], host_role_id, Decimal("10000.00"), monkeypatch)
    rows = await _commissions_for_item(item_id)
    assert rows["direct"].partner_net_amount == Decimal("8800.00")  # 12% legacy ROOM_TYPE default
    assert rows["network"].partner_role_id == uuid.UUID(expert_role_id)
    assert rows["network"].commission_amount == Decimal("200.00")  # 2% default network rate
    assert rows["network"].attribution_id is not None

    earnings = (await api.get("/api/v1/partners/earnings/expert", headers=_auth(expert_token))).json()
    assert any(c["source"] == "network" and Decimal(c["commission_amount"]) == Decimal("200.00") for c in earnings["commissions"])
    member = (await api.get("/api/v1/referrals/me/members", headers=_auth(expert_token))).json()[0]
    assert Decimal(member["earnings_pending"]) == Decimal("200.00")
    stats = (await api.get("/api/v1/referrals/me", headers=_auth(expert_token))).json()["stats"]
    assert stats["active"] == 1 and stats["signups"] == 1 and stats["visits"] == 1

    # The expert booking their own referral earns no network cut.
    item_id = await _book_and_commission(expert_user["id"], host_role_id, Decimal("10000.00"), monkeypatch)
    assert set(await _commissions_for_item(item_id)) == {"direct"}

    # The cut never exceeds Ovigo's own direct commission.
    attribution_id = member["id"]
    r = await api.post(
        f"/api/v1/admin/network-attributions/{attribution_id}/terms",
        json={"custom_commission_rate": "0.5"}, headers=_auth(admin),
    )
    assert r.status_code == 200, r.text
    item_id = await _book_and_commission(traveler["id"], host_role_id, Decimal("10000.00"), monkeypatch)
    rows = await _commissions_for_item(item_id)
    assert rows["network"].commission_amount == rows["direct"].commission_amount == Decimal("1200.00")

    # No commission after the agreement expires.
    async with await _session() as db:
        a = await db.get(NetworkAttribution, uuid.UUID(attribution_id))
        a.commission_expires_at = datetime.now(UTC) - timedelta(minutes=1)
        await db.commit()
    item_id = await _book_and_commission(traveler["id"], host_role_id, Decimal("10000.00"), monkeypatch)
    assert set(await _commissions_for_item(item_id)) == {"direct"}
    assert (await api.get("/api/v1/referrals/me/members", headers=_auth(expert_token))).json()[0]["status"] == "expired"

    # Revoking cancels the unpaid network rows.
    r = await api.post(
        f"/api/v1/admin/network-attributions/{attribution_id}/revoke", json={"reason": "test revoke"}, headers=_auth(admin)
    )
    assert r.status_code == 200 and r.json()["status"] == "revoked"
    earnings = (await api.get("/api/v1/partners/earnings/expert", headers=_auth(expert_token))).json()
    assert all(c["status"] == "cancelled" for c in earnings["commissions"] if c["source"] == "network")


@db_tests
async def test_guide_joining_through_link_is_supervised_by_that_expert(api):
    admin = await _admin_token(api)
    expert_token, _, _ = await _approved_expert(api, admin, "Expert Guide-Mentor")
    code = (await api.get("/api/v1/referrals/me", headers=_auth(expert_token))).json()["code"]

    guide_token, _ = await _register(api, "Guide Sumon")
    r = await _apply(api, guide_token, "guide", referral_code=code, accept_network_terms=True)
    assert r.status_code == 201, r.text

    guides = (await api.get("/api/v1/guides/my-guides", headers=_auth(expert_token))).json()
    assert len(guides) == 1
    assert guides[0]["status"] == "accepted" and guides[0]["guide"]["full_name"] == "Guide Sumon"
    assert guides[0]["guide_role_approved"] is False
    member = (await api.get("/api/v1/referrals/me/members", headers=_auth(expert_token))).json()[0]
    assert member["role_type"] == "guide" and member["status"] == "pending"


@db_tests
async def test_referral_link_abuse_is_blocked(api):
    admin = await _admin_token(api)
    a_token, a_user, a_role = await _approved_expert(api, admin, "Expert A")
    b_token, b_user, b_role = await _approved_expert(api, admin, "Expert B")
    a_code = (await api.get("/api/v1/referrals/me", headers=_auth(a_token))).json()["code"]
    b_code = (await api.get("/api/v1/referrals/me", headers=_auth(b_token))).json()["code"]

    # Self-referral.
    r = await _apply(api, a_token, "host", referral_code=a_code, accept_network_terms=True)
    assert r.status_code == 409 and "own network" in r.json()["detail"]

    # A Local Expert role can't be referred (one level deep).
    c_token, _ = await _register(api, "Would-be Expert")
    r = await _apply(api, c_token, "local_expert", referral_code=a_code, accept_network_terms=True)
    assert r.status_code == 409
    # ...and nothing was half-created by the rejected application.
    assert (await api.get("/api/v1/partners/roles", headers=_auth(c_token))).json() == []

    # Reciprocal: A's homestay joins B's network, then B's homestay can't join A's.
    r = await _apply(api, a_token, "host", referral_code=b_code, accept_network_terms=True)
    assert r.status_code == 201, r.text
    r = await _apply(api, b_token, "host", referral_code=a_code, accept_network_terms=True)
    assert r.status_code == 409 and "reciprocal" in r.json()["detail"]

    # A regenerated link stops accepting new signups; the old member is unaffected.
    r = await api.post("/api/v1/referrals/me/regenerate", headers=_auth(b_token))
    assert r.status_code == 200 and r.json()["code"] != b_code
    d_token, _ = await _register(api, "Late Host")
    r = await _apply(api, d_token, "host", referral_code=b_code, accept_network_terms=True)
    assert r.status_code == 409 and "no longer active" in r.json()["detail"]
    assert len((await api.get("/api/v1/referrals/me/members", headers=_auth(b_token))).json()) == 1

    # First touch wins: rejected then re-applied with another expert's code keeps the original referrer.
    e_token, _ = await _register(api, "Host Twice")
    r = await _apply(api, e_token, "hotel", referral_code=a_code, accept_network_terms=True)
    role_id = r.json()["id"]
    r = await api.post(f"/api/v1/admin/partners/roles/{role_id}/reject", json={"reason": "docs missing"}, headers=_auth(admin))
    assert r.status_code == 200, r.text
    new_b_code = (await api.get("/api/v1/referrals/me", headers=_auth(b_token))).json()["code"]
    r = await _apply(api, e_token, "hotel", referral_code=new_b_code, accept_network_terms=True)
    assert r.status_code == 201, r.text
    a_members = (await api.get("/api/v1/referrals/me/members", headers=_auth(a_token))).json()
    assert [m["member_name"] for m in a_members] == ["Host Twice"] and a_members[0]["status"] == "pending"
    b_members = (await api.get("/api/v1/referrals/me/members", headers=_auth(b_token))).json()
    assert "Host Twice" not in [m["member_name"] for m in b_members]


@db_tests
async def test_business_referral_link_partner_writes_attribution(api, monkeypatch):
    admin = await _admin_token(api)
    expert_token, _, expert_role_id = await _approved_expert(api, admin, "Expert Biz")
    r = await api.post(
        "/api/v1/business-network",
        json={"business_name": f"Seaside Homestay {uuid.uuid4().hex[:6]}", "business_type": "homestay", "ownership_type": "referred"},
        headers=_auth(expert_token),
    )
    assert r.status_code == 201, r.text
    referral_id = r.json()["id"]
    assert (await api.post(f"/api/v1/admin/business-network/{referral_id}/approve", headers=_auth(admin))).status_code == 200

    host_token, _ = await _register(api, "Biz Owner")
    host_role_id = (await _apply(api, host_token, "host")).json()["id"]
    await api.post(f"/api/v1/admin/partners/roles/{host_role_id}/approve", headers=_auth(admin))

    r = await api.post(
        f"/api/v1/admin/business-network/{referral_id}/link-partner",
        json={"partner_role_id": host_role_id}, headers=_auth(admin),
    )
    assert r.status_code == 200, r.text
    member = (await api.get("/api/v1/referrals/me/members", headers=_auth(expert_token))).json()[0]
    assert member["source"] == "business_referral" and member["status"] == "active"

    _, traveler = await _register(api, "Biz Traveler")
    item_id = await _book_and_commission(traveler["id"], host_role_id, Decimal("5000.00"), monkeypatch)
    rows = await _commissions_for_item(item_id)
    assert rows["network"].partner_role_id == uuid.UUID(expert_role_id)
    assert rows["network"].commission_amount == Decimal("100.00")
