"""The public tour page's expert card and the Local Expert public profile (PRD
§8.2): every track-record number is computed from real bookings, reviews and
chats, never a stored placeholder; "nothing yet" is None. Plus the reviews-by-
expert list and the EXPERT chat context. End-to-end against a real Postgres; see
tests/test_referral_network.py's docstring for how these run."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from tests.db_helpers import admin_token, approved_expert, auth, db_tests, register, session


async def _publish_profile(api, expert_token: str) -> None:
    r = await api.put(
        "/api/v1/partners/profiles/expert",
        json={"headline": "Hill-tracts specialist", "bio": "Twelve years in Bandarban.", "years_experience": 12,
              "languages": ["Bangla", "English"], "is_published": True},
        headers=auth(expert_token),
    )
    assert r.status_code == 200, r.text


async def _tour(expert_role_id: str, *departures: tuple[int, int, str]) -> tuple[str, list[str]]:
    """A published tour with departures given as (days from today, seats, status)."""
    from app.modules.tours.models import Tour, TourDeparture, TourStatus

    async with await session() as db:
        tour = Tour(
            local_expert_role_id=uuid.UUID(expert_role_id), title="Nilgiri Sunrise Trek", slug=f"nilgiri-{uuid.uuid4().hex[:10]}",
            duration_days=2, base_price=Decimal("10000"), max_group_size=10, status=TourStatus.PUBLISHED,
        )
        db.add(tour)
        await db.flush()
        ids = []
        for offset, seats, status in departures:
            dep = TourDeparture(tour_id=tour.id, departure_date=date.today() + timedelta(days=offset), available_seats=seats, status=status)
            db.add(dep)
            await db.flush()
            ids.append(str(dep.id))
        await db.commit()
        return str(tour.id), ids


async def _paid_booking(api, departure_id: str) -> tuple[str, str, str]:
    """A traveler's booking on this departure, paid (CONFIRMED). Returns (token, booking id, item id)."""
    from app.modules.bookings.models import Booking, BookingStatus, BookingStatusHistory

    token, _ = await register(api, "Traveler Tania")
    r = await api.post(
        "/api/v1/bookings", json={"items": [{"item_type": "tour_departure", "tour_departure_id": departure_id}]}, headers=auth(token)
    )
    assert r.status_code == 201, r.text
    booking = r.json()
    async with await session() as db:
        row = await db.get(Booking, uuid.UUID(booking["id"]))
        row.status = BookingStatus.CONFIRMED
        db.add(BookingStatusHistory(booking_id=row.id, from_status="pending_payment", to_status="confirmed"))
        await db.commit()
    return token, booking["id"], booking["items"][0]["id"]


async def _complete(api, token: str, booking_id: str) -> None:
    for step in ("check-in", "check-out"):
        r = await api.post(f"/api/v1/bookings/{booking_id}/{step}", headers=auth(token))
        assert r.status_code == 200, r.text


@db_tests
async def test_a_new_expert_shows_no_invented_numbers(api):
    admin = await admin_token(api)
    expert_token, _, expert_role = await approved_expert(api, admin, "Expert Karim")
    await _publish_profile(api, expert_token)
    tour_id, _ = await _tour(expert_role, (10, 8, "open"))

    profile = (await api.get(f"/api/v1/partners/profiles/expert/{expert_role}/public")).json()
    assert profile["rating_avg"] is None and profile["reviews_count"] == 0
    assert profile["response_rate_percent"] is None and profile["avg_response_minutes"] is None
    assert profile["completion_rate_percent"] is None and profile["cancellation_rate_percent"] is None
    assert profile["completed_bookings"] == 0 and profile["total_tours_conducted"] == 0
    assert profile["identity_verified"] is False and profile["security_verification_status"] == "pending"

    card = (await api.get(f"/api/v1/tours/{tour_id}")).json()["expert"]
    assert card["name"] == "Expert Karim" and card["profile_public"] is True and card["rating_avg"] is None


@db_tests
async def test_track_record_is_computed_from_bookings_reviews_and_chats(api):
    admin = await admin_token(api)
    expert_token, _, expert_role = await approved_expert(api, admin, "Expert Karim")
    await _publish_profile(api, expert_token)
    tour_id, (past, upcoming, full, cancelled_dep) = await _tour(
        expert_role, (-20, 10, "completed"), (12, 6, "open"), (15, 0, "open"), (20, 6, "cancelled")
    )

    # Two paid bookings that completed (reviewed 5 and 4), one paid and then cancelled,
    # and one abandoned checkout that never counts.
    for rating in (5, 4):
        token, booking_id, item_id = await _paid_booking(api, past)
        await _complete(api, token, booking_id)
        r = await api.post("/api/v1/reviews", json={"booking_item_id": item_id, "rating": rating, "comment": "Great"}, headers=auth(token))
        assert r.status_code == 201, r.text
    token, booking_id, _ = await _paid_booking(api, upcoming)
    assert (await api.post(f"/api/v1/bookings/{booking_id}/cancel", headers=auth(token))).status_code == 200
    unpaid_token, _ = await register(api, "Traveler Unpaid")
    r = await api.post("/api/v1/bookings", json={"items": [{"item_type": "tour_departure", "tour_departure_id": upcoming}]}, headers=auth(unpaid_token))
    assert r.status_code == 201

    # Two travelers write in; the expert answers one of them 30 minutes later.
    from app.modules.chat.models import ChatMessage

    answered, ignored = (await register(api, "Asker One"))[0], (await register(api, "Asker Two"))[0]
    threads = []
    for token in (answered, ignored):
        t = await api.post("/api/v1/chat/threads", json={"context_type": "tour", "context_id": tour_id}, headers=auth(token))
        assert t.status_code == 200, t.text
        threads.append(t.json()["id"])
        await api.post(f"/api/v1/chat/threads/{threads[-1]}/messages", json={"body": "Is this trek OK for beginners?"}, headers=auth(token))
    reply = await api.post(f"/api/v1/chat/threads/{threads[0]}/messages", json={"body": "Yes, we go slowly."}, headers=auth(expert_token))
    assert reply.status_code == 200, reply.text
    async with await session() as db:
        msg = await db.get(ChatMessage, uuid.UUID(reply.json()["id"]))
        msg.created_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.commit()

    p = (await api.get(f"/api/v1/partners/profiles/expert/{expert_role}/public")).json()
    assert Decimal(p["rating_avg"]) == Decimal("4.50") and p["reviews_count"] == 2
    assert p["rating_breakdown"] == {"5": 1, "4": 1, "3": 0, "2": 0, "1": 0}
    assert p["completed_bookings"] == 2 and p["total_tours_conducted"] == 1
    assert p["completion_rate_percent"] == 67  # 2 completed of 3 paid (one cancelled)
    assert p["cancellation_rate_percent"] == 33
    assert p["response_rate_percent"] == 50 and 29 <= p["avg_response_minutes"] <= 31
    # Only future, open departures with seats left.
    assert [d["departure_id"] for d in p["upcoming_departures"]] == [upcoming]

    reviews = (await api.get("/api/v1/reviews", params={"expert_role_id": expert_role})).json()
    assert sorted(r["rating"] for r in reviews) == [4, 5]

    card = (await api.get(f"/api/v1/tours/{tour_id}")).json()["expert"]
    assert (Decimal(card["rating_avg"]), card["reviews_count"], card["completed_bookings"]) == (Decimal("4.50"), 2, 2)


@db_tests
async def test_unpublished_profile_still_names_the_expert_on_the_tour(api):
    admin = await admin_token(api)
    _, _, expert_role = await approved_expert(api, admin, "Expert Nadia")
    tour_id, _ = await _tour(expert_role, (10, 8, "open"))
    assert (await api.get(f"/api/v1/partners/profiles/expert/{expert_role}/public")).status_code == 404
    card = (await api.get(f"/api/v1/tours/{tour_id}")).json()["expert"]
    assert card["name"] == "Expert Nadia" and card["profile_public"] is False and card["photo_url"] is None


@db_tests
async def test_profile_lists_the_experts_guides_stays_and_transport(api):
    from app.modules.stays.models import Property, PropertyStatus, PropertyType
    from app.modules.tours.models import TourStay, TourTransport

    admin = await admin_token(api)
    expert_token, _, expert_role = await approved_expert(api, admin, "Expert Karim")
    await _publish_profile(api, expert_token)
    tour_id, _ = await _tour(expert_role, (10, 8, "open"))
    _, _, host_role = await approved_expert(api, admin, "Host Mong")  # any approved role can own a property here
    async with await session() as db:
        prop = Property(host_role_id=uuid.UUID(host_role), name="Boga Lake Homestay", slug=f"boga-{uuid.uuid4().hex[:8]}",
                        property_type=PropertyType.HOMESTAY, status=PropertyStatus.PUBLISHED, children_allowed=True, pets_allowed=False)
        db.add(prop)
        await db.flush()
        db.add(TourStay(tour_id=uuid.UUID(tour_id), property_id=prop.id, description="Lakeside", nights=1))
        db.add(TourTransport(tour_id=uuid.UUID(tour_id), mode="Jeep", provider_name="Hill Wheels", vehicle_type="4x4"))
        await db.commit()
    guide_token, guide = await register(api, "Guide Thowai")
    sup = (await api.post("/api/v1/guides/invite", json={"email": guide["email"]}, headers=auth(expert_token))).json()
    await api.post(f"/api/v1/guides/supervisions/{sup['id']}/respond", json={"accept": True}, headers=auth(guide_token))
    await api.post(f"/api/v1/admin/partners/roles/{sup['guide']['id']}/approve", headers=auth(admin))

    p = (await api.get(f"/api/v1/partners/profiles/expert/{expert_role}/public")).json()
    assert [g["name"] for g in p["guides"]] == ["Guide Thowai"]
    assert [x["name"] for x in p["properties"]] == ["Boga Lake Homestay"]
    assert p["transport"] == [{"mode": "Jeep", "provider_name": "Hill Wheels", "vehicle_type": "4x4"}]


@db_tests
async def test_travelers_can_message_an_expert_from_their_profile(api):
    admin = await admin_token(api)
    expert_token, _, expert_role = await approved_expert(api, admin, "Expert Karim")
    traveler, _ = await register(api, "Traveler Tania")
    r = await api.post("/api/v1/chat/threads", json={"context_type": "expert", "context_id": expert_role}, headers=auth(traveler))
    assert r.status_code == 200, r.text
    assert r.json()["context_title"] == "Chat with Expert Karim"
    # Only an approved Local Expert can be messaged this way, and not by themself.
    r = await api.post("/api/v1/chat/threads", json={"context_type": "expert", "context_id": str(uuid.uuid4())}, headers=auth(traveler))
    assert r.status_code == 404
    r = await api.post("/api/v1/chat/threads", json={"context_type": "expert", "context_id": expert_role}, headers=auth(expert_token))
    assert r.status_code == 409
