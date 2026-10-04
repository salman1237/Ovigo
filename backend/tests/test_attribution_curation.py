"""Phase 9.2 — commission engine completion: ride-bid commission (bug B1),
acquisition channel and seller attribution (PRD §12.5), and tour-curation
commission (PRD §12.4). End-to-end against a real Postgres; see
tests/test_referral_network.py's docstring for how these run."""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.modules.bookings.schemas import BookingItemCreate
from app.modules.bookings.models import BookingItemType
from tests.db_helpers import (
    admin_token,
    approved_expert,
    approved_partner,
    auth,
    commissions_for_item,
    db_tests,
    register,
    run_commissions,
    session,
)


def test_via_tour_id_only_applies_to_stays():
    import pytest

    with pytest.raises(ValueError):
        BookingItemCreate(item_type=BookingItemType.TOUR_DEPARTURE, tour_departure_id=uuid.uuid4(), via_tour_id=uuid.uuid4())


async def _published_property(host_role_id: str, price: Decimal = Decimal("4000.00")) -> tuple[uuid.UUID, uuid.UUID]:
    """A published property with one room type, open for the next 10 nights."""
    from app.modules.stays.models import AvailabilityCalendar, Property, PropertyStatus, PropertyType, RoomType

    async with await session() as db:
        prop = Property(
            host_role_id=uuid.UUID(host_role_id), name=f"Hill View {uuid.uuid4().hex[:6]}",
            slug=f"hill-view-{uuid.uuid4().hex[:10]}", property_type=PropertyType.HOMESTAY,
            status=PropertyStatus.PUBLISHED, children_allowed=True, pets_allowed=False,
        )
        db.add(prop)
        await db.flush()
        room = RoomType(property_id=prop.id, name="Double", max_occupancy=2, base_price=price, total_units=3)
        db.add(room)
        await db.flush()
        for i in range(10):
            db.add(AvailabilityCalendar(room_type_id=room.id, date=date.today() + timedelta(days=i), available_units=3))
        await db.commit()
        return prop.id, room.id


async def _published_tour_with_stay(expert_role_id: str, property_id: uuid.UUID | None) -> uuid.UUID:
    from app.modules.tours.models import Tour, TourStatus, TourStay

    async with await session() as db:
        tour = Tour(
            local_expert_role_id=uuid.UUID(expert_role_id), title="Sajek Valley Escape",
            slug=f"sajek-{uuid.uuid4().hex[:10]}", duration_days=3, base_price=Decimal("9000"),
            max_group_size=10, status=TourStatus.PUBLISHED,
        )
        db.add(tour)
        await db.flush()
        db.add(TourStay(tour_id=tour.id, property_id=property_id, description="Hill-view homestay", nights=2))
        await db.commit()
        return tour.id


def _stay_item(room_type_id: uuid.UUID, **extra) -> dict:
    return {
        "item_type": "room_type",
        "room_type_id": str(room_type_id),
        "check_in_date": (date.today() + timedelta(days=1)).isoformat(),
        "check_out_date": (date.today() + timedelta(days=3)).isoformat(),
        "quantity": 1,
        **extra,
    }


async def _booking_row(booking_id: str):
    from app.modules.bookings.models import Booking

    async with await session() as db:
        return await db.get(Booking, uuid.UUID(booking_id))


@db_tests
async def test_stay_booked_through_a_tour_earns_the_curating_expert(api):
    admin = await admin_token(api)
    expert_token, expert_user, expert_role = await approved_expert(api, admin, "Curator Expert")
    _, _, host_role = await approved_partner(api, admin, "Homestay Owner", "host")
    property_id, room_type_id = await _published_property(host_role)
    tour_id = await _published_tour_with_stay(expert_role, property_id)

    traveler_token, _ = await register(api, "Curated Traveler")
    r = await api.post(
        "/api/v1/bookings", json={"items": [_stay_item(room_type_id, via_tour_id=str(tour_id))]}, headers=auth(traveler_token)
    )
    assert r.status_code == 201, r.text
    booking = r.json()
    item = booking["items"][0]
    assert item["curated_by_tour_id"] == str(tour_id)
    assert booking["acquisition_channel"] == "organic"

    await run_commissions(uuid.UUID(booking["id"]))
    rows = await commissions_for_item(uuid.UUID(item["id"]))
    assert set(rows) == {"direct", "curation"}
    assert rows["direct"].partner_role_id == uuid.UUID(host_role)
    assert rows["direct"].partner_net_amount == Decimal("7040.00")  # 8000 - 12%
    assert rows["curation"].partner_role_id == uuid.UUID(expert_role)
    assert rows["curation"].commission_amount == Decimal("160.00")  # 2% default curation rate

    from app.modules.bookings.models import BookingItem

    async with await session() as db:
        db_item = await db.get(BookingItem, uuid.UUID(item["id"]))
        assert db_item.sold_by_role_id == uuid.UUID(expert_role)

    earnings = (await api.get("/api/v1/partners/earnings/expert", headers=auth(expert_token))).json()
    assert any(c["source"] == "curation" for c in earnings["commissions"])

    # A stay that isn't part of the tour: no curation, sold by the host.
    other_prop, other_room = await _published_property(host_role)
    r = await api.post(
        "/api/v1/bookings", json={"items": [_stay_item(other_room, via_tour_id=str(tour_id))]}, headers=auth(traveler_token)
    )
    assert r.status_code == 201, r.text
    assert r.json()["items"][0]["curated_by_tour_id"] is None


@db_tests
async def test_expert_who_referred_and_curated_is_paid_only_the_higher_cut(api):
    admin = await admin_token(api)
    expert_token, _, expert_role = await approved_expert(api, admin, "Referrer Curator")
    code = (await api.get("/api/v1/referrals/me", headers=auth(expert_token))).json()["code"]
    _, _, host_role = await approved_partner(
        api, admin, "Referred Host", "host", referral_code=code, accept_network_terms=True
    )
    property_id, room_type_id = await _published_property(host_role)
    tour_id = await _published_tour_with_stay(expert_role, property_id)

    # Curation rate above the network rate: curation wins, network dropped.
    from app.modules.commissions.models import CommissionRule, CommissionRuleScope

    async with await session() as db:
        rule = CommissionRule(scope=CommissionRuleScope.CURATION, rate=Decimal("0.05"))
        db.add(rule)
        await db.commit()
        rule_id = rule.id
    try:
        traveler_token, _ = await register(api, "Double Traveler")
        r = await api.post(
            "/api/v1/bookings", json={"items": [_stay_item(room_type_id, via_tour_id=str(tour_id))]},
            headers=auth(traveler_token),
        )
        assert r.status_code == 201, r.text
        await run_commissions(uuid.UUID(r.json()["id"]))
        rows = await commissions_for_item(uuid.UUID(r.json()["items"][0]["id"]))
        assert set(rows) == {"direct", "curation"}
        assert rows["curation"].commission_amount == Decimal("400.00")  # 5% of 8000, beats 2% network
    finally:
        async with await session() as db:
            await db.delete(await db.get(CommissionRule, rule_id))
            await db.commit()

    # Without the higher curation rule, the 2% network and 2% curation tie: one row, not two.
    r = await api.post(
        "/api/v1/bookings", json={"items": [_stay_item(room_type_id, via_tour_id=str(tour_id))]},
        headers=auth(traveler_token),
    )
    await run_commissions(uuid.UUID(r.json()["id"]))
    rows = await commissions_for_item(uuid.UUID(r.json()["items"][0]["id"]))
    assert set(rows) == {"direct", "network"}


@db_tests
async def test_acquisition_channel_expert_and_advertising(api):
    admin = await admin_token(api)
    expert_token, _, expert_role = await approved_expert(api, admin, "Acquiring Expert")
    code = (await api.get("/api/v1/referrals/me", headers=auth(expert_token))).json()["code"]
    host_token, _, host_role = await approved_partner(api, admin, "Ad Host", "host")
    property_id, room_type_id = await _published_property(host_role)

    # Registered through an expert's link -> EXPERT channel, credited to that expert.
    traveler_token, _ = await register(api, "Linked Traveler", referral_code=code)
    r = await api.post("/api/v1/bookings", json={"items": [_stay_item(room_type_id)]}, headers=auth(traveler_token))
    assert r.status_code == 201, r.text
    assert r.json()["acquisition_channel"] == "expert"
    assert (await _booking_row(r.json()["id"])).acquisition_expert_role_id == uuid.UUID(expert_role)

    # A click on an ad for this property -> ADVERTISING, which takes precedence.
    from app.modules.ads.models import AdBillingModel, AdCampaign, AdCampaignStatus, AdPlacementType
    from app.modules.locations.models import TaggableEntityType

    async with await session() as db:
        campaign = AdCampaign(
            partner_role_id=uuid.UUID(host_role), entity_type=TaggableEntityType.PROPERTY, entity_id=property_id,
            placement_type=AdPlacementType.SPONSORED, billing_model=AdBillingModel.CPC, bid_amount=Decimal("5"),
            budget_total=Decimal("500"), budget_spent=Decimal("0"), status=AdCampaignStatus.ACTIVE,
            impressions_count=0, clicks_count=1,
        )
        unrelated = AdCampaign(
            partner_role_id=uuid.UUID(host_role), entity_type=TaggableEntityType.PROPERTY, entity_id=uuid.uuid4(),
            placement_type=AdPlacementType.SPONSORED, billing_model=AdBillingModel.CPC, bid_amount=Decimal("5"),
            budget_total=Decimal("500"), budget_spent=Decimal("0"), status=AdCampaignStatus.ACTIVE,
            impressions_count=0, clicks_count=1,
        )
        db.add_all([campaign, unrelated])
        await db.commit()
        campaign_id, unrelated_id = campaign.id, unrelated.id

    r = await api.post(
        "/api/v1/bookings", json={"items": [_stay_item(room_type_id)], "ad_campaign_id": str(campaign_id)},
        headers=auth(traveler_token),
    )
    assert r.json()["acquisition_channel"] == "advertising"
    assert (await _booking_row(r.json()["id"])).ad_campaign_id == campaign_id

    # An ad for something else in the booking doesn't count.
    plain_token, _ = await register(api, "Plain Traveler")
    r = await api.post(
        "/api/v1/bookings", json={"items": [_stay_item(room_type_id)], "ad_campaign_id": str(unrelated_id)},
        headers=auth(plain_token),
    )
    assert r.json()["acquisition_channel"] == "organic"

    # The admin report sees paid bookings by channel.
    from app.modules.bookings.models import Booking, BookingStatus
    from sqlalchemy import update

    async with await session() as db:
        await db.execute(update(Booking).where(Booking.user_id.isnot(None)).values(status=BookingStatus.CONFIRMED))
        await db.commit()
    rows = (await api.get("/api/v1/admin/reports/acquisition-channels", headers=auth(admin))).json()
    channels = {(row["channel"], row["acquired_by"]) for row in rows}
    assert ("expert", "Acquiring Expert") in channels
    assert ("advertising", "Ad by Ad Host") in channels


@db_tests
async def test_ride_bid_bookings_now_generate_commission(api):
    admin = await admin_token(api)
    _, _, rac_role = await approved_partner(api, admin, "Ride Operator", "rent_a_car")
    traveler_token, traveler = await register(api, "Ride Traveler")

    from app.modules.bookings import service as bookings_service
    from app.modules.ride_requests.models import RideBid, RideBidStatus, RideRequest, RideRequestStatus
    from app.modules.users.models import User

    async with await session() as db:
        request = RideRequest(
            traveler_id=uuid.UUID(traveler["id"]), pickup_label="Dhaka", pickup_lat=Decimal("23.81"),
            pickup_lng=Decimal("90.41"), dropoff_label="Sylhet", dropoff_lat=Decimal("24.89"),
            dropoff_lng=Decimal("91.87"), departure_date=date.today() + timedelta(days=2), passengers=2,
            status=RideRequestStatus.CLOSED,
        )
        db.add(request)
        await db.flush()
        bid = RideBid(
            request_id=request.id, rent_a_car_role_id=uuid.UUID(rac_role), price=Decimal("6000"),
            with_driver=True, status=RideBidStatus.ACCEPTED,
        )
        db.add(bid)
        await db.commit()
        user = await db.get(User, uuid.UUID(traveler["id"]))
        booking = await bookings_service.create_booking_from_ride_bid(db, user, bid.id, Decimal("6000.00"))
        booking_id, item_id = booking.id, booking.items[0].id

    await run_commissions(booking_id)
    rows = await commissions_for_item(item_id)
    assert set(rows) == {"direct"}
    assert rows["direct"].partner_role_id == uuid.UUID(rac_role)
    assert rows["direct"].commission_amount == Decimal("720.00")  # 12% legacy RIDE_BID default
