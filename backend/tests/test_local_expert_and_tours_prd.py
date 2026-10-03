import uuid
from decimal import Decimal
import pytest
from app.modules.tours.models import TourStatus, TourType, MealType
from app.modules.tours.schemas import TourCreate, TourUpdate, ItineraryDayCreate, DepartureCreate, MealCreate, ActivityCreate, TransportCreate, TourStayCreate, TourStatusUpdate
from app.modules.profiles.schemas import LocalExpertProfileUpsert, PublicLocalExpertProfile

def test_tour_statuses_prd_compliance():
    """Verify all 14 lifecycle statuses from PRD Section 10.4 are present."""
    required_statuses = [
        "draft", "submitted_for_review", "changes_requested", "approved",
        "scheduled", "booking_open", "almost_full", "sold_out",
        "confirmed", "in_progress", "completed", "cancelled",
        "suspended", "archived"
    ]
    current_values = [s.value for s in TourStatus]
    for req in required_statuses:
        assert req in current_values, f"Missing required PRD tour status: {req}"

def test_tour_types_prd_compliance():
    """Verify all 14 tour types from PRD Section 10.1 are present."""
    required_types = [
        "fixed_departure", "private", "group", "ground", "day", "multi_day",
        "experience", "family", "couple", "adventure", "food",
        "photography", "cultural", "corporate"
    ]
    current_values = [t.value for t in TourType]
    for req in required_types:
        assert req in current_values, f"Missing required PRD tour type: {req}"

def test_tour_create_schema_prd_fields():
    """Verify TourCreate accepts all comprehensive PRD 10.3 & 10.5 fields."""
    tour_data = TourCreate(
        title="Sylhet Tea Gardens & Waterfalls Trek",
        short_summary="A 3-day guided cultural and nature trek across Sylhet",
        duration_days=3,
        duration_nights=2,
        base_price=Decimal("12000.00"),
        min_group_size=4,
        max_group_size=15,
        tour_type=TourType.TREKKING,
        suitable_traveler_type=["family", "couples", "adventure_seekers"],
        child_price=Decimal("6000.00"),
        infant_price=Decimal("0.00"),
        couple_price=Decimal("22000.00"),
        price_per_group=Decimal("110000.00"),
        currency="BDT",
        pickup_location="Sylhet Railway Station",
        pickup_time="08:00 AM",
        dropoff_location="Sylhet City Center",
        dropoff_time="06:00 PM",
        pickup_window="30 minutes",
        pickup_contact_person="Rokon Chowdhury",
        home_hotel_pickup_available=True,
        home_pickup_extra_charge=Decimal("1500.00"),
        late_arrival_policy="Departures begin promptly at scheduled time",
        nearest_hospital="Sylhet Osmani Medical College Hospital",
        first_aid_available=True,
        women_safety_notes="Dedicated female guide option, safe family stays",
        child_safety_notes="Child safety harnesses provided during mountain walks",
        night_travel_policy="No travel after 8:00 PM",
        permit_requirements="Forest department entry pass included",
        insurance_included=True,
        emergency_procedure="Immediate local hospital transfer via partner vehicle",
        cancellation_policy="Full refund up to 72 hours prior to departure",
        included_services=["All meals", "AC transport", "Guide fees", "Hotel accommodation"],
        excluded_services=["Personal tips", "Optional boat upgrades"],
    )
    assert tour_data.title == "Sylhet Tea Gardens & Waterfalls Trek"
    assert tour_data.duration_nights == 2
    assert tour_data.currency == "BDT"
    assert tour_data.insurance_included is True
    assert "Forest department entry pass included" == tour_data.permit_requirements

def test_tour_subresource_schemas_prd_compliance():
    """Verify Meals, Activities, Stays, Transport, Departures, and Itinerary schemas."""
    meal = MealCreate(
        day_number=1,
        meal_type=MealType.LUNCH,
        description="Traditional Bengali lunch at Panshi",
        is_vegetarian=False,
        is_vegan=False,
        is_halal=True,
        allergy_notes="Peanuts used in select desserts",
        children_menu_available=True,
        restaurant_provider="Panshi Restaurant",
        optional_upgrade_price=Decimal("500.00"),
    )
    assert meal.is_halal is True
    assert meal.children_menu_available is True

    activity = ActivityCreate(
        day_number=2,
        name="Ratargul Swamp Forest Kayaking",
        description="Guided boat and kayak ride through freshwater swamp forest",
        is_included=True,
        duration_hours=Decimal("3.5"),
        location_name="Ratargul Swamp Forest",
        difficulty="moderate",
        safety_notes="Life jackets mandatory",
        guide_required=True,
        is_high_risk=False,
        weather_dependency="Suspended during severe thunderstorms",
    )
    assert activity.weather_dependency is not None

    transport = TransportCreate(
        mode="Private AC Microbus",
        description="Toyota HiAce 12-seater AC microbus with professional driver",
        provider_name="Green Line Transfers",
        vehicle_type="Microbus",
        vehicle_model="Toyota HiAce 2022",
        driver_included=True,
        has_ac=True,
        capacity=12,
        driver_name="Abdul Karim",
        pickup_location="Sylhet Airport",
        pickup_time="09:00 AM",
        dropoff_location="Hotel Grand Sylhet",
        dropoff_time="10:00 AM",
        route_info="Airport to Hotel via Airport Road",
        luggage_policy="1 large suitcase + 1 backpack per traveler",
    )
    assert transport.driver_included is True
    assert transport.has_ac is True

    stay = TourStayCreate(
        stay_name="Grand Sylhet Hotel & Resort",
        description="5-star luxury stay in Sylhet",
        nights=2,
        property_type="Resort",
        room_category="Deluxe King",
        occupancy_arrangement="Double occupancy",
        room_sharing_policy="Separate beds for solo travelers sharing a room",
        check_in_out_info="Check-in 2 PM, Check-out 12 PM",
        stay_location="Airport Road, Sylhet",
        source_type="owned",
    )
    assert stay.nights == 2
    assert stay.occupancy_arrangement == "Double occupancy"

    departure = DepartureCreate(
        departure_date="2026-11-15",
        return_date="2026-11-18",
        departure_time="08:00 AM",
        return_time="06:00 PM",
        min_participants=4,
        max_participants=12,
        available_seats=12,
        confirmation_threshold=4,
        status="open",
        recurrence_rule="FREQ=WEEKLY;BYDAY=SU",
    )
    assert departure.available_seats == 12
    assert departure.min_participants == 4

def test_public_expert_profile_schema_compliance():
    """Verify PublicLocalExpertProfile matches PRD Section 8.2 requirements."""
    profile = PublicLocalExpertProfile(
        partner_role_id=uuid.uuid4(),
        name="Kamal Hossain",
        headline="Certified Sylhet Nature & Heritage Guide",
        bio="Leading off-the-beaten-path expeditions across Sylhet and Sreemangal for 8+ years.",
        years_experience=8,
        languages=["Bengali", "English", "Sylheti"],
        has_photo=True,
        photo_url="/api/v1/partners/profiles/expert/test/photo/file",
        primary_destination="Sylhet",
        secondary_destinations=["Sreemangal", "Sunamganj"],
        expertise_categories=["Eco Tourism", "Trekking", "Wildlife", "Tea Culture"],
        security_verification_status="verified",
        emergency_handling_capability=True,
        rating_avg=Decimal("4.95"),
        reviews_count=48,
        total_tours_conducted=112,
        response_rate_percent=98,
        completion_rate_percent=100,
        cancellation_rate_percent=0,
        badge_level="Top Rated Expert",
        tours=[],
    )
    assert profile.name == "Kamal Hossain"
    assert profile.rating_avg == Decimal("4.95")
    assert profile.emergency_handling_capability is True
    assert "Eco Tourism" in profile.expertise_categories
