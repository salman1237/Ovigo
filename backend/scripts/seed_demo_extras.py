"""One-off: fill in every remaining module with a small amount of realistic
demo data — ads, badges, custom-trip bidding, business referrals, chat,
disputes, payouts, promo codes — on top of the catalog (seed_demo_data.py) and
bookings (seed_demo_bookings.py) already seeded. Uses the real service-layer
functions throughout so every state transition, notification, and side effect
fires exactly as it would for real usage.

    python scripts/seed_demo_extras.py
"""
import asyncio
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

import app.all_models  # noqa: E402, F401
from app.database import AsyncSessionLocal  # noqa: E402
from app.modules.ads import service as ads_service  # noqa: E402
from app.modules.ads.models import AdBillingModel, AdPlacementType  # noqa: E402
from app.modules.ads.schemas import AdCampaignCreate  # noqa: E402
from app.modules.badges import service as badges_service  # noqa: E402
from app.modules.badges.models import BadgeType  # noqa: E402
from app.modules.badges.schemas import BadgeApply  # noqa: E402
from app.modules.bidding import service as bidding_service  # noqa: E402
from app.modules.bidding.schemas import BidCreate, CustomTourRequestCreate, ItineraryDayIn  # noqa: E402
from app.modules.bookings.models import Booking, BookingItem  # noqa: E402
from app.modules.business_network import service as biznet_service  # noqa: E402
from app.modules.business_network.models import OwnershipType  # noqa: E402
from app.modules.business_network.schemas import BusinessReferralCreate  # noqa: E402
from app.modules.chat import service as chat_service  # noqa: E402
from app.modules.chat.models import ChatContextType, ChatMessageType  # noqa: E402
from app.modules.chat.schemas import ChatMessageCreate, ChatThreadCreate  # noqa: E402
from app.modules.disputes import service as disputes_service  # noqa: E402
from app.modules.disputes.models import DisputeResolution  # noqa: E402
from app.modules.disputes.schemas import DisputeCreate, DisputeResolve  # noqa: E402
from app.modules.locations.models import Location, TaggableEntityType  # noqa: E402
from app.modules.payouts import service as payouts_service  # noqa: E402
from app.modules.promotions import service as promotions_service  # noqa: E402
from app.modules.promotions.models import PromoDiscountType  # noqa: E402
from app.modules.promotions.schemas import PromoCodeCreate  # noqa: E402
from app.modules.rentcar.models import Vehicle  # noqa: E402
from app.modules.stays.models import Property  # noqa: E402
from app.modules.tours.models import Tour, TourDeparture  # noqa: E402
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleType, User  # noqa: E402


async def get_user(db, email: str) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one()
    return user


async def get_role(db, email: str, role_type: PartnerRoleType) -> PartnerRole:
    result = await db.execute(
        select(PartnerRole)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .join(User, User.id == PartnerAccount.user_id)
        .where(User.email == email, PartnerRole.role_type == role_type)
    )
    return result.scalar_one()


async def main() -> None:
    async with AsyncSessionLocal() as db:
        traveler = await get_user(db, "demo-traveler@ovigo-demo.com")
        traveler2 = await get_user(db, "demo-traveler2@ovigo-demo.com")
        admin = await get_user(db, "demo-admin@ovigo-demo.com")

        expert0 = await get_role(db, "demo-expert@ovigo-demo.com", PartnerRoleType.LOCAL_EXPERT)
        expert1 = await get_role(db, "seed-expert-1@ovigo-demo.com", PartnerRoleType.LOCAL_EXPERT)
        host0 = await get_role(db, "demo-host@ovigo-demo.com", PartnerRoleType.HOST)
        rentcar0 = await get_role(db, "demo-rentcar@ovigo-demo.com", PartnerRoleType.RENT_A_CAR)

        cox_tour = (await db.execute(select(Tour).where(Tour.title == "Cox's Bazar Beach Escape"))).scalar_one()
        sea_pearl = (await db.execute(select(Property).where(Property.name == "Sea Pearl Beach Resort"))).scalar_one()
        dhaka_car = (
            await db.execute(select(Vehicle).where(Vehicle.make == "Toyota", Vehicle.model == "Corolla Axio"))
        ).scalar_one()

        # --- Ad campaigns: one active, one draft, alongside the existing pending-review one ---
        coxs_bazar_loc_for_ad = (await db.execute(select(Location).where(Location.slug == "coxs-bazar"))).scalar_one()
        active_campaign = await ads_service.create_campaign(
            db,
            expert0,
            AdCampaignCreate(
                entity_type=TaggableEntityType.TOUR,
                entity_id=cox_tour.id,
                placement_type=AdPlacementType.SPONSORED,
                billing_model=AdBillingModel.CPC,
                bid_amount=Decimal("15.00"),
                budget_total=Decimal("5000.00"),
                start_date=date.today(),
                end_date=date.today() + timedelta(days=30),
            ),
        )
        await ads_service.set_campaign_locations(db, expert0, active_campaign.id, [coxs_bazar_loc_for_ad.id])
        await ads_service.submit_for_review(db, expert0, active_campaign.id)
        await ads_service.approve_campaign(db, admin, active_campaign.id)
        for _ in range(12):
            await ads_service.record_click(db, active_campaign.id)
        await db.commit()

        await ads_service.create_campaign(
            db,
            rentcar0,
            AdCampaignCreate(
                entity_type=TaggableEntityType.VEHICLE,
                entity_id=dhaka_car.id,
                placement_type=AdPlacementType.CARD,
                billing_model=AdBillingModel.CPM,
                bid_amount=Decimal("8.00"),
                budget_total=Decimal("2000.00"),
            ),
        )
        await db.commit()
        print("Ads: 1 active (sponsored, with clicks), 1 draft")

        # --- Badges: one approved, one pending ---
        verified = await badges_service.apply_for_badge(
            db,
            await get_user(db, "demo-expert@ovigo-demo.com"),
            BadgeApply(entity_type=TaggableEntityType.PARTNER_ROLE, entity_id=expert0.id, badge_type=BadgeType.VERIFIED),
        )
        await badges_service.approve_badge(db, verified.id)
        await badges_service.apply_for_badge(
            db,
            await get_user(db, "demo-host@ovigo-demo.com"),
            BadgeApply(
                entity_type=TaggableEntityType.PROPERTY,
                entity_id=sea_pearl.id,
                badge_type=BadgeType.COUPLE_FRIENDLY,
                private_note="We welcome all couples regardless of marital status documentation.",
            ),
        )
        await db.commit()
        print("Badges: VERIFIED (approved) on demo-expert, COUPLE_FRIENDLY (pending) on Sea Pearl Beach Resort")

        # --- Business referrals: one approved, on top of the existing pending one ---
        referral = await biznet_service.create_referral(
            db,
            expert0,
            BusinessReferralCreate(
                business_name="Himchari Sunset Cafe",
                business_type="restaurant",
                contact_phone="+8801700000000",
                contact_email="contact@himcharicafe.example.com",
                description="A beachfront cafe recommended to every traveler visiting Himchari.",
                ownership_type=OwnershipType.REFERRED,
            ),
        )
        await biznet_service.approve_referral(db, admin, referral.id)
        await db.commit()
        print("Business referrals: 1 approved (Himchari Sunset Cafe)")

        # --- Custom trip requests + bids ---
        coxs_bazar_loc = (await db.execute(select(Location).where(Location.slug == "coxs-bazar"))).scalar_one()
        sundarbans_loc = (await db.execute(select(Location).where(Location.slug == "sundarbans"))).scalar_one()

        request_a = await bidding_service.create_request(
            db,
            traveler,
            CustomTourRequestCreate(
                title="8-day family trip to Cox's Bazar",
                description="Looking for a relaxed family itinerary with beach time, a Himchari day trip, and a good seafood restaurant recommendation.",
                start_date=date.today() + timedelta(days=60),
                end_date=date.today() + timedelta(days=68),
                group_size=4,
                budget_min=Decimal("60000"),
                budget_max=Decimal("90000"),
                location_id=coxs_bazar_loc.id,
            ),
        )
        bid_a = await bidding_service.submit_bid(
            db,
            expert0,
            request_a.id,
            BidCreate(
                price=Decimal("78000"),
                message="I can put together an 8-day itinerary with a private Himchari trip and reserved seafood dinners.",
                itinerary=[
                    ItineraryDayIn(day_number=1, title="Arrival & beach orientation"),
                    ItineraryDayIn(day_number=4, title="Himchari waterfall day trip"),
                    ItineraryDayIn(day_number=8, title="Departure"),
                ],
            ),
        )
        await bidding_service.accept_bid(db, traveler, request_a.id, bid_a["id"])
        await db.commit()
        print("Custom trip request A: accepted bid from demo-expert -> booking created (pending payment)")

        request_b = await bidding_service.create_request(
            db,
            traveler2,
            CustomTourRequestCreate(
                title="4-day wildlife trip to the Sundarbans",
                description="Two adults, interested in a smaller boat group and early-morning wildlife spotting.",
                start_date=date.today() + timedelta(days=50),
                end_date=date.today() + timedelta(days=54),
                group_size=2,
                budget_min=Decimal("40000"),
                budget_max=Decimal("60000"),
                location_id=sundarbans_loc.id,
            ),
        )
        await bidding_service.submit_bid(
            db,
            expert1,
            request_b.id,
            BidCreate(
                price=Decimal("52000"),
                message="I run small-group boats (max 6 guests) with two dawn wildlife excursions included.",
                itinerary=[
                    ItineraryDayIn(day_number=1, title="River entry & mangrove orientation"),
                    ItineraryDayIn(day_number=2, title="Dawn wildlife excursion"),
                ],
            ),
        )
        await db.commit()
        print("Custom trip request B: left OPEN with 1 pending bid from seed-expert-1")

        # --- Chat: a pre-booking inquiry, and a post-booking thread ---
        thread1 = await chat_service.get_or_create_thread(
            db, traveler2, ChatThreadCreate(context_type=ChatContextType.TOUR, context_id=cox_tour.id)
        )
        await chat_service.send_message(
            db, traveler2, thread1.id, ChatMessageCreate(body="Hi! Is this tour suitable for a solo traveler?")
        )
        expert0_user = await get_user(db, "demo-expert@ovigo-demo.com")
        await chat_service.send_message(
            db, expert0_user, thread1.id, ChatMessageCreate(body="Yes, absolutely — we get solo travelers on almost every departure.")
        )

        # Booking-context thread on the first completed booking (Cox's Bazar, demo-traveler)
        result = await db.execute(
            select(Booking).where(Booking.user_id == traveler.id).order_by(Booking.created_at).limit(1)
        )
        first_booking = result.scalar_one()
        booking_item_id = (
            await db.execute(select(BookingItem.id).where(BookingItem.booking_id == first_booking.id).limit(1))
        ).scalar_one()
        thread2 = await chat_service.get_or_create_thread(
            db, traveler, ChatThreadCreate(context_type=ChatContextType.BOOKING_ITEM, context_id=booking_item_id)
        )
        await chat_service.send_message(
            db, traveler, thread2.id, ChatMessageCreate(body="Thanks for the great trip! Could you recommend a good spot for dinner tonight?")
        )
        await chat_service.send_message(
            db, expert0_user, thread2.id, ChatMessageCreate(body="Try the seafood place right by Laboni Beach — ask for the grilled pomfret.")
        )
        await db.commit()
        print("Chat: 1 pre-booking inquiry thread, 1 post-booking thread, 2 messages each")

        # --- Dispute: raised on the Sundarbans booking, resolved as rejected ---
        # Joined to the specific tour rather than "traveler2's oldest booking" —
        # that picked up a pre-existing booking (with its own pre-existing open
        # dispute) the first time this was run against production.
        result = await db.execute(
            select(Booking)
            .join(BookingItem, BookingItem.booking_id == Booking.id)
            .join(TourDeparture, TourDeparture.id == BookingItem.tour_departure_id)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(Booking.user_id == traveler2.id, Tour.title == "Sundarbans Mangrove Safari")
            .limit(1)
        )
        sundarbans_booking = result.scalar_one()
        dispute = await disputes_service.create_dispute(
            db,
            traveler2,
            DisputeCreate(
                booking_id=sundarbans_booking.id,
                reason="The boat departed 90 minutes late and we missed the morning wildlife window we were promised.",
            ),
        )
        await disputes_service.resolve_dispute(
            db,
            admin,
            dispute.id,
            DisputeResolve(
                resolution=DisputeResolution.REJECTED,
                note="Delay was caused by a weather advisory that morning, communicated in advance via the tour operator — not eligible for refund, but a 10% credit was offered separately.",
            ),
        )
        await db.commit()
        print("Dispute: raised on Sundarbans booking, resolved as rejected")

        # --- Promo codes ---
        await promotions_service.create_promo_code(
            db,
            admin,
            PromoCodeCreate(
                code="EXPLOREBD",
                discount_type=PromoDiscountType.PERCENTAGE,
                discount_value=Decimal("10.00"),
                max_redemptions=500,
                max_redemptions_per_user=1,
                expires_at=datetime.now(timezone.utc) + timedelta(days=90),
            ),
        )
        expired = await promotions_service.create_promo_code(
            db,
            admin,
            PromoCodeCreate(
                code="SUMMER2026",
                discount_type=PromoDiscountType.FIXED_AMOUNT,
                discount_value=Decimal("500.00"),
                max_redemptions=200,
                max_redemptions_per_user=1,
                expires_at=datetime.now(timezone.utc) - timedelta(days=5),
            ),
        )
        await promotions_service.deactivate_promo_code(db, expired.id)
        await db.commit()
        print("Promo codes: EXPLOREBD (active, 10%), SUMMER2026 (expired/deactivated, fixed ৳500)")

        # --- Payouts: sweep whatever's PAYABLE right now into paid batches ---
        batches = await payouts_service.run_payout_batch(db, admin)
        await db.commit()
        print(f"Payouts: ran a batch, {len(batches)} partner payout(s) created")

        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
