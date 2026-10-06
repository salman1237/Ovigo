"""Phase 9.3 — guides as an earning channel (PRD §10.8–10.9), per the client's
decisions: guide fees for expert assignments are paid through Ovigo; travelers can
also book a guide's priced packages directly; Ovigo charges 12% on every sale; the
expert who onboarded a guide earns 2% of the guide's business out of Ovigo's
share; a guide can work with several experts; guide fees become payable once the
departure's tour bookings complete and are held while one is disputed.
End-to-end against a real Postgres; see tests/test_referral_network.py's
docstring for how these run."""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.modules.bookings.models import BookingItemType
from app.modules.bookings.schemas import BookingItemCreate
from app.modules.commissions.service import _LEGACY_DEFAULTS
from tests.db_helpers import (
    admin_token,
    approved_expert,
    approved_partner,
    auth,
    commissions_for_item,
    db_tests,
    register,
    session,
    upload_required_documents,
)

D = lambda days: date.today() + timedelta(days=days)  # noqa: E731


def test_every_item_type_defaults_to_twelve_percent():
    assert set(_LEGACY_DEFAULTS) == set(BookingItemType)
    assert set(_LEGACY_DEFAULTS.values()) == {Decimal("0.12")}


def test_guide_service_item_needs_one_package_and_one_date():
    package = uuid.uuid4()
    BookingItemCreate(item_type=BookingItemType.GUIDE_SERVICE, guide_package_id=package, check_in_date=D(3))
    with pytest.raises(ValueError):
        BookingItemCreate(item_type=BookingItemType.GUIDE_SERVICE, check_in_date=D(3))
    with pytest.raises(ValueError):
        BookingItemCreate(item_type=BookingItemType.GUIDE_SERVICE, guide_package_id=package)
    with pytest.raises(ValueError):
        BookingItemCreate(
            item_type=BookingItemType.GUIDE_SERVICE, guide_package_id=package, check_in_date=D(3), check_out_date=D(4)
        )
    with pytest.raises(ValueError):
        BookingItemCreate(item_type=BookingItemType.GUIDE_SERVICE, guide_package_id=package, check_in_date=D(3), quantity=2)


# --- helpers ---


async def _invite(api, expert_token: str, guide_email: str) -> dict:
    r = await api.post("/api/v1/guides/invite", json={"email": guide_email}, headers=auth(expert_token))
    assert r.status_code == 201, r.text
    return r.json()


async def _accept(api, guide_token: str, supervision_id: str) -> None:
    r = await api.post(f"/api/v1/guides/supervisions/{supervision_id}/respond", json={"accept": True}, headers=auth(guide_token))
    assert r.status_code == 200, r.text


async def _invited_guide(api, admin: str, expert_token: str, name: str = "Guide Rafi") -> tuple[str, dict, str]:
    """A new user, invited by this expert, who accepts and is then approved by Ovigo."""
    token, user = await register(api, name)
    supervision = await _invite(api, expert_token, user["email"])
    await _accept(api, token, supervision["id"])
    role_id = supervision["guide"]["id"]
    await upload_required_documents(api, token, role_id, "guide")
    r = await api.post(f"/api/v1/admin/partners/roles/{role_id}/approve", headers=auth(admin))
    assert r.status_code == 200, r.text
    return token, user, role_id


async def _packages(api, guide_token: str) -> tuple[str, str]:
    ids = []
    for name, hours, price in (("Half day", "4", "800"), ("Full day", "8", "1400")):
        r = await api.post(
            "/api/v1/guides/packages",
            json={"name": name, "duration_hours": hours, "price": price},
            headers=auth(guide_token),
        )
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])
    return ids[0], ids[1]


async def _publish(api, admin: str, guide_token: str, guide_role_id: str) -> None:
    r = await api.put(
        "/api/v1/guides/profile/mine",
        json={"headline": "Hill-tracts trekking guide", "bio": "Ten years walking Bandarban.", "city": "Bandarban",
              "languages": ["Bangla", "English", "english"], "years_experience": 10},
        headers=auth(guide_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["languages"] == ["Bangla", "English"]
    r = await api.post("/api/v1/guides/profile/mine/submit", headers=auth(guide_token))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending_review"
    r = await api.post(f"/api/v1/admin/guides/profiles/{guide_role_id}/approve", headers=auth(admin))
    assert r.status_code == 200, r.text


async def _open(api, guide_token: str, *days: date) -> None:
    r = await api.put(
        "/api/v1/guides/availability",
        json={"dates": [d.isoformat() for d in days], "is_available": True},
        headers=auth(guide_token),
    )
    assert r.status_code == 204, r.text


async def _book_guide(api, traveler_token: str, package_id: str, day: date):
    return await api.post(
        "/api/v1/bookings",
        json={"items": [{"item_type": "guide_service", "guide_package_id": package_id, "check_in_date": day.isoformat()}]},
        headers=auth(traveler_token),
    )


async def _tour_departure(expert_role_id: str, day: date, *, duration_days: int = 1) -> str:
    from app.modules.tours.models import Tour, TourDeparture, TourStatus

    async with await session() as db:
        tour = Tour(
            local_expert_role_id=uuid.UUID(expert_role_id), title="Nilgiri Day Trek",
            slug=f"nilgiri-{uuid.uuid4().hex[:10]}", duration_days=duration_days, base_price=Decimal("9000"),
            max_group_size=10, status=TourStatus.PUBLISHED,
        )
        db.add(tour)
        await db.flush()
        departure = TourDeparture(tour_id=tour.id, departure_date=day, available_seats=10)
        db.add(departure)
        await db.commit()
        return str(departure.id)


async def _confirm(booking_id: str) -> None:
    """What payments/service.py::_activate_booking does once a payment succeeds."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.modules.bookings.models import Booking, BookingStatus
    from app.modules.commissions import service as commissions_service
    from app.modules.guides import service as guides_service

    async with await session() as db:
        booking = (
            await db.execute(select(Booking).where(Booking.id == uuid.UUID(booking_id)).options(selectinload(Booking.items)))
        ).scalar_one()
        booking.status = BookingStatus.CONFIRMED
        await commissions_service.create_commissions_for_booking(db, booking)
        await guides_service.notify_guides_of_booking(db, booking)
        await db.commit()


async def _book_tour(api, traveler_token: str, departure_id: str) -> tuple[str, str]:
    r = await api.post(
        "/api/v1/bookings",
        json={"items": [{"item_type": "tour_departure", "tour_departure_id": departure_id, "quantity": 1}]},
        headers=auth(traveler_token),
    )
    assert r.status_code == 201, r.text
    booking = r.json()
    await _confirm(booking["id"])
    return booking["id"], booking["items"][0]["id"]


async def _complete_booking(api, traveler_token: str, booking_id: str) -> None:
    for step in ("check-in", "check-out"):
        r = await api.post(f"/api/v1/bookings/{booking_id}/{step}", headers=auth(traveler_token))
        assert r.status_code == 200, r.text


async def _assign_and_complete(api, expert_token: str, guide_token: str, guide_role_id: str, departure_id: str, **fee) -> dict:
    r = await api.post(
        f"/api/v1/guides/{guide_role_id}/assignments",
        json={"tour_departure_id": departure_id, **fee},
        headers=auth(expert_token),
    )
    assert r.status_code == 201, r.text
    assignment = r.json()
    for step in ("check-in", "complete"):
        r = await api.post(f"/api/v1/guides/assignments/{assignment['id']}/{step}", headers=auth(guide_token))
        assert r.status_code == 200, r.text
    return assignment


async def _fee_rows(assignment_id: str) -> dict[str, object]:
    from sqlalchemy import select

    from app.modules.commissions.models import Commission

    async with await session() as db:
        rows = (
            await db.execute(select(Commission).where(Commission.guide_assignment_id == uuid.UUID(assignment_id)))
        ).scalars().all()
        return {c.source.value: c for c in rows}


async def _statuses(assignment_id: str) -> set[str]:
    return {c.status.value for c in (await _fee_rows(assignment_id)).values()}


async def _attribution_for(role_id: str):
    from sqlalchemy import select

    from app.modules.referrals.models import NetworkAttribution

    async with await session() as db:
        return (
            await db.execute(select(NetworkAttribution).where(NetworkAttribution.referred_partner_role_id == uuid.UUID(role_id)))
        ).scalar_one_or_none()


async def _preview_total(api, admin: str, role_id: str) -> Decimal | None:
    r = await api.get("/api/v1/admin/payouts/preview", headers=auth(admin))
    assert r.status_code == 200, r.text
    rows = [row for row in r.json() if row["partner_role_id"] == role_id]
    return Decimal(rows[0]["total_amount"]) if rows else None


# --- multi-expert supervision and invite attribution ---


@db_tests
async def test_a_guide_works_with_several_experts_and_the_first_inviter_onboarded_them(api):
    admin = await admin_token(api)
    karim_token, _, karim_role = await approved_expert(api, admin, "Expert Karim")
    nadia_token, _, nadia_role = await approved_expert(api, admin, "Expert Nadia")
    guide_token, guide, guide_role = await _invited_guide(api, admin, karim_token)

    attribution = await _attribution_for(guide_role)
    assert attribution.source.value == "guide_invite"
    assert str(attribution.referring_expert_role_id) == karim_role
    assert attribution.status.value == "active"  # started when Ovigo approved the guide

    # A second expert can work with the same guide; the onboarding expert doesn't change.
    supervision = await _invite(api, nadia_token, guide["email"])
    await _accept(api, guide_token, supervision["id"])
    r = await api.get("/api/v1/guides/my-supervisions", headers=auth(guide_token))
    assert {s["expert"]["id"] for s in r.json() if s["status"] == "accepted"} == {karim_role, nadia_role}
    assert str((await _attribution_for(guide_role)).referring_expert_role_id) == karim_role

    # One live relationship per pair.
    r = await api.post("/api/v1/guides/invite", json={"email": guide["email"]}, headers=auth(nadia_token))
    assert r.status_code == 409


@db_tests
async def test_declining_an_invite_drops_the_onboarding_credit_and_the_pair_can_start_again(api):
    admin = await admin_token(api)
    karim_token, _, _ = await approved_expert(api, admin, "Expert Karim")
    guide_token, guide = await register(api, "Guide Mitu")
    supervision = await _invite(api, karim_token, guide["email"])
    guide_role = supervision["guide"]["id"]
    assert (await _attribution_for(guide_role)).status.value == "pending"

    r = await api.post(f"/api/v1/guides/supervisions/{supervision['id']}/respond", json={"accept": False}, headers=auth(guide_token))
    assert r.status_code == 200, r.text
    assert await _attribution_for(guide_role) is None

    again = await _invite(api, karim_token, guide["email"])
    assert again["id"] == supervision["id"] and again["status"] == "pending"


@db_tests
async def test_an_already_approved_guide_isnt_credited_to_a_later_inviter(api):
    admin = await admin_token(api)
    karim_token, _, karim_role = await approved_expert(api, admin, "Expert Karim")
    nadia_token, _, _ = await approved_expert(api, admin, "Expert Nadia")
    _, guide, guide_role = await _invited_guide(api, admin, karim_token)
    await _invite(api, nadia_token, guide["email"])
    assert str((await _attribution_for(guide_role)).referring_expert_role_id) == karim_role

    # A guide who joined Ovigo on their own, and was approved, wasn't onboarded by
    # whoever invites them afterwards.
    _, independent, independent_role = await approved_partner(api, admin, "Guide Sumon", "guide")
    await _invite(api, nadia_token, independent["email"])
    assert await _attribution_for(independent_role) is None


# --- travelers booking a guide directly ---


@db_tests
async def test_traveler_books_a_guide_package_and_the_onboarding_expert_earns_two_percent(api):
    admin = await admin_token(api)
    karim_token, _, karim_role = await approved_expert(api, admin, "Expert Karim")
    guide_token, _, guide_role = await _invited_guide(api, admin, karim_token)
    half_day, full_day = await _packages(api, guide_token)

    # Not public until Ovigo approves the profile.
    r = await api.get(f"/api/v1/guides/public/{guide_role}")
    assert r.status_code == 404
    await _publish(api, admin, guide_token, guide_role)
    r = await api.get("/api/v1/guides/public", params={"city": "bandar", "language": "english"})
    listed = [g for g in r.json() if g["guide_role_id"] == guide_role]
    assert listed and Decimal(listed[0]["from_price"]) == Decimal("800") and listed[0]["package_count"] == 2

    traveler_token, _ = await register(api, "Traveler Tania")
    r = await _book_guide(api, traveler_token, full_day, D(5))
    assert r.status_code == 409 and "hasn't opened" in r.json()["detail"]
    await _open(api, guide_token, D(5), D(6))
    r = await _book_guide(api, traveler_token, full_day, D(5))
    assert r.status_code == 201, r.text
    booking = r.json()
    item = booking["items"][0]
    assert Decimal(booking["total_amount"]) == Decimal("1400") and item["guide_package_id"] == full_day
    await _confirm(booking["id"])

    rows = await commissions_for_item(uuid.UUID(item["id"]))
    direct, network = rows["direct"], rows["network"]
    assert str(direct.partner_role_id) == guide_role
    assert (direct.rate, direct.commission_amount, direct.partner_net_amount) == (Decimal("0.12"), Decimal("168.00"), Decimal("1232.00"))
    assert str(network.partner_role_id) == karim_role and network.partner_net_amount == Decimal("28.00")

    r = await api.get("/api/v1/guides/bookings/mine", headers=auth(guide_token))
    mine = r.json()
    assert [(b["service_date"], b["package_name"], b["traveler_name"]) for b in mine] == [
        (D(5).isoformat(), "Full day", "Traveler Tania")
    ]

    # The date is taken now — for travelers and for expert assignments alike.
    other_token, _ = await register(api, "Traveler Omar")
    r = await _book_guide(api, other_token, half_day, D(5))
    assert r.status_code == 409 and "already booked" in r.json()["detail"]
    r = await api.get(
        f"/api/v1/guides/public/{guide_role}/open-dates",
        params={"start": D(0).isoformat(), "end": D(10).isoformat()},
    )
    assert r.json()["dates"] == [D(6).isoformat()]
    departure = await _tour_departure(karim_role, D(5))
    r = await api.post(
        f"/api/v1/guides/{guide_role}/assignments",
        json={"tour_departure_id": departure, "package_id": full_day},
        headers=auth(karim_token),
    )
    assert r.status_code == 409 and "already booked" in r.json()["detail"]

    # Prices are the guide's to change; the booking keeps the price it was made at.
    r = await api.patch(f"/api/v1/guides/packages/{full_day}", json={"price": "1500"}, headers=auth(guide_token))
    assert r.status_code == 200 and Decimal(r.json()["price"]) == Decimal("1500")
    r = await api.get(f"/api/v1/bookings/{booking['id']}", headers=auth(traveler_token))
    assert Decimal(r.json()["items"][0]["subtotal"]) == Decimal("1400")

    # A hidden package can't be booked, and drops off the public profile.
    r = await api.patch(f"/api/v1/guides/packages/{full_day}", json={"is_active": False}, headers=auth(guide_token))
    assert r.status_code == 200 and r.json()["is_active"] is False
    r = await _book_guide(api, other_token, full_day, D(6))
    assert r.status_code == 404
    r = await api.get(f"/api/v1/guides/public/{guide_role}")
    assert [p["name"] for p in r.json()["packages"]] == ["Half day"]

    # Cancelling frees the date again.
    r = await api.post(f"/api/v1/bookings/{booking['id']}/cancel", headers=auth(traveler_token))
    assert r.status_code == 200, r.text
    r = await _book_guide(api, other_token, half_day, D(5))
    assert r.status_code == 201, r.text


@db_tests
async def test_the_onboarding_expert_booking_their_own_guide_earns_no_referral_cut(api):
    admin = await admin_token(api)
    karim_token, _, _ = await approved_expert(api, admin, "Expert Karim")
    guide_token, _, guide_role = await _invited_guide(api, admin, karim_token)
    _, full_day = await _packages(api, guide_token)
    await _publish(api, admin, guide_token, guide_role)
    await _open(api, guide_token, D(4))
    r = await _book_guide(api, karim_token, full_day, D(4))
    assert r.status_code == 201, r.text
    await _confirm(r.json()["id"])
    assert set(await commissions_for_item(uuid.UUID(r.json()["items"][0]["id"]))) == {"direct"}


# --- an expert hiring a guide, paid through Ovigo ---


@db_tests
async def test_guide_fee_is_charged_like_a_sale_and_payable_after_the_tour_completes(api):
    admin = await admin_token(api)
    karim_token, _, karim_role = await approved_expert(api, admin, "Expert Karim")  # onboarded the guide
    nadia_token, _, nadia_role = await approved_expert(api, admin, "Expert Nadia")  # hires the guide
    guide_token, guide, guide_role = await _invited_guide(api, admin, karim_token)
    await _accept(api, guide_token, (await _invite(api, nadia_token, guide["email"]))["id"])
    _, full_day = await _packages(api, guide_token)

    # Nadia's packages view is there whether or not the guide's profile is public.
    r = await api.get(f"/api/v1/guides/{guide_role}/packages", headers=auth(nadia_token))
    assert [p["name"] for p in r.json()] == ["Half day", "Full day"]

    departure = await _tour_departure(nadia_role, D(7))
    traveler_token, _ = await register(api, "Traveler Tania")
    tour_booking, tour_item = await _book_tour(api, traveler_token, departure)
    tour_direct = (await commissions_for_item(uuid.UUID(tour_item)))["direct"]
    assert (tour_direct.rate, tour_direct.partner_net_amount) == (Decimal("0.12"), Decimal("7920.00"))  # 12%, was 10%

    assignment = await _assign_and_complete(api, nadia_token, guide_token, guide_role, departure, package_id=full_day)
    assert Decimal(assignment["fee_amount"]) == Decimal("1400") and assignment["package"]["name"] == "Full day"

    rows = await _fee_rows(assignment["id"])
    assert set(rows) == {"guide_fee", "guide_fee_deduction", "network"}
    fee, deduction, network = rows["guide_fee"], rows["guide_fee_deduction"], rows["network"]
    assert str(fee.partner_role_id) == guide_role
    assert (fee.gross_amount, fee.commission_amount, fee.partner_net_amount) == (Decimal("1400.00"), Decimal("168.00"), Decimal("1232.00"))
    assert str(deduction.partner_role_id) == nadia_role and deduction.partner_net_amount == Decimal("-1400.00")
    assert str(network.partner_role_id) == karim_role and network.partner_net_amount == Decimal("28.00")
    # Ovigo keeps 12% minus the 2% network cut; nothing is created or lost.
    assert fee.partner_net_amount + network.partner_net_amount + deduction.partner_net_amount == Decimal("-140.00")

    # Not payable while the departure's tour booking is still running.
    assert await _statuses(assignment["id"]) == {"pending"}
    await _complete_booking(api, traveler_token, tour_booking)
    assert await _statuses(assignment["id"]) == {"payable"}

    # The fee comes out of what Ovigo owes Nadia.
    assert await _preview_total(api, admin, nadia_role) == Decimal("6520.00")
    assert await _preview_total(api, admin, guide_role) == Decimal("1232.00")

    r = await api.get("/api/v1/partners/earnings/guide", headers=auth(guide_token))
    assert r.status_code == 200 and Decimal(r.json()["total_net_payable"]) == Decimal("1232.00")
    r = await api.get("/api/v1/partners/earnings/expert", headers=auth(nadia_token))
    assert Decimal(r.json()["total_gross"]) == Decimal("9000.00")  # the guide fee isn't a sale of hers


@db_tests
async def test_hiring_a_guide_you_onboarded_pays_no_referral_cut_and_dates_cant_double_up(api):
    admin = await admin_token(api)
    karim_token, _, karim_role = await approved_expert(api, admin, "Expert Karim")
    guide_token, _, guide_role = await _invited_guide(api, admin, karim_token)
    first = await _tour_departure(karim_role, D(10), duration_days=3)

    r = await api.post(f"/api/v1/guides/{guide_role}/assignments", json={"tour_departure_id": first}, headers=auth(karim_token))
    assert r.status_code == 422  # a package or a fee is required

    overlapping = await _tour_departure(karim_role, D(12))
    assignment = await _assign_and_complete(api, karim_token, guide_token, guide_role, first, fee_amount="3000")
    r = await api.post(
        f"/api/v1/guides/{guide_role}/assignments", json={"tour_departure_id": overlapping, "fee_amount": "800"},
        headers=auth(karim_token),
    )
    assert r.status_code == 409 and D(12).isoformat() in r.json()["detail"]

    rows = await _fee_rows(assignment["id"])
    assert set(rows) == {"guide_fee", "guide_fee_deduction"}  # no cut on your own purchase
    # Nobody booked that departure, so the fee is payable as soon as the guide is done.
    assert await _statuses(assignment["id"]) == {"payable"}
    # Karim owes more than he's owed: nothing to pay him, and his rows wait to net off.
    assert await _preview_total(api, admin, karim_role) is None
    assert {c.status.value for c in rows.values()} == {"payable"}


@db_tests
async def test_the_guide_fee_waits_for_every_booking_on_the_departure(api):
    admin = await admin_token(api)
    nadia_token, _, nadia_role = await approved_expert(api, admin, "Expert Nadia")
    guide_token, _, guide_role = await _invited_guide(api, admin, nadia_token)
    departure = await _tour_departure(nadia_role, D(9))
    tania_token, _ = await register(api, "Traveler Tania")
    omar_token, _ = await register(api, "Traveler Omar")
    tania_booking, _ = await _book_tour(api, tania_token, departure)
    omar_booking, _ = await _book_tour(api, omar_token, departure)
    # An abandoned, never-paid booking doesn't hold anything up.
    unpaid_token, _ = await register(api, "Traveler Unpaid")
    r = await api.post(
        "/api/v1/bookings", json={"items": [{"item_type": "tour_departure", "tour_departure_id": departure}]},
        headers=auth(unpaid_token),
    )
    assert r.status_code == 201, r.text

    assignment = await _assign_and_complete(api, nadia_token, guide_token, guide_role, departure, fee_amount="1200")
    await _complete_booking(api, tania_token, tania_booking)
    assert await _statuses(assignment["id"]) == {"pending"}  # Omar's trip hasn't finished
    r = await api.post(f"/api/v1/bookings/{omar_booking}/cancel", headers=auth(omar_token))
    assert r.status_code == 200, r.text
    assert await _statuses(assignment["id"]) == {"payable"}


@db_tests
async def test_a_dispute_on_the_tour_holds_the_guide_fee_and_a_refund_doesnt_cancel_it(api):
    admin = await admin_token(api)
    nadia_token, _, nadia_role = await approved_expert(api, admin, "Expert Nadia")
    guide_token, _, guide_role = await _invited_guide(api, admin, nadia_token)
    departure = await _tour_departure(nadia_role, D(8))
    traveler_token, _ = await register(api, "Traveler Tania")
    tour_booking, tour_item = await _book_tour(api, traveler_token, departure)
    assignment = await _assign_and_complete(api, nadia_token, guide_token, guide_role, departure, fee_amount="1000")
    await _complete_booking(api, traveler_token, tour_booking)
    assert await _statuses(assignment["id"]) == {"payable"}

    r = await api.post(
        "/api/v1/disputes", json={"booking_id": tour_booking, "reason": "The trek was cut short by half."},
        headers=auth(traveler_token),
    )
    assert r.status_code == 201, r.text
    assert await _statuses(assignment["id"]) == {"on_hold"}

    r = await api.post(
        f"/api/v1/admin/disputes/{r.json()['id']}/resolve", json={"resolution": "refunded", "note": "Partial trek"},
        headers=auth(admin),
    )
    assert r.status_code == 200, r.text
    assert (await commissions_for_item(uuid.UUID(tour_item)))["direct"].status.value == "cancelled"
    assert await _statuses(assignment["id"]) == {"payable"}  # the guide still did the work


@db_tests
async def test_guide_profile_review_and_submission_rules(api):
    admin = await admin_token(api)
    karim_token, _, _ = await approved_expert(api, admin, "Expert Karim")
    guide_token, _, guide_role = await _invited_guide(api, admin, karim_token)

    r = await api.post("/api/v1/guides/profile/mine/submit", headers=auth(guide_token))
    assert r.status_code == 409  # headline, city, bio first
    await api.put(
        "/api/v1/guides/profile/mine", json={"headline": "City walks", "bio": "Old Dhaka food walks.", "city": "Dhaka"},
        headers=auth(guide_token),
    )
    r = await api.post("/api/v1/guides/profile/mine/submit", headers=auth(guide_token))
    assert r.status_code == 409 and "package" in r.json()["detail"]
    await _packages(api, guide_token)
    r = await api.post("/api/v1/guides/profile/mine/submit", headers=auth(guide_token))
    assert r.status_code == 200, r.text
    r = await api.put("/api/v1/guides/profile/mine", json={"city": "Sylhet"}, headers=auth(guide_token))
    assert r.status_code == 409  # locked while under review

    r = await api.post(f"/api/v1/admin/guides/profiles/{guide_role}/reject", json={"reason": "Add a photo-free bio"}, headers=auth(admin))
    assert r.status_code == 200 and r.json()["profile"]["status"] == "rejected"
    r = await api.post("/api/v1/guides/profile/mine/submit", headers=auth(guide_token))
    assert r.status_code == 200
    r = await api.post(f"/api/v1/admin/guides/profiles/{guide_role}/approve", headers=auth(admin))
    assert r.json()["profile"]["status"] == "published"
    r = await api.post(f"/api/v1/admin/guides/profiles/{guide_role}/suspend", json={"reason": "Complaints"}, headers=auth(admin))
    assert r.json()["profile"]["status"] == "suspended"
    assert (await api.get(f"/api/v1/guides/public/{guide_role}")).status_code == 404
