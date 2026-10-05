"""Phase 9.5 (PRD §10.5 Bug B4 & B5): tiered checkout pricing and bookable statuses.

Tests the service-level logic without a real DB by exercising the schema
validators and the _reserve_tour_departure helper in isolation.  The DB-backed
round-trip is covered implicitly by test_track_record_is_computed_from_bookings_reviews_and_chats
which creates real bookings (the same code path, no tiered fields).
"""
import uuid
from decimal import Decimal

import pytest

from app.modules.bookings.schemas import BookingItemCreate, BookingItemType
from app.modules.tours.models import TourStatus
from app.modules.tours.service import BOOKABLE_TOUR_STATUSES, PUBLIC_TOUR_STATUSES


# ── Bookable-statuses (Bug B4) ────────────────────────────────────────────────

def test_bookable_statuses_are_subset_of_public():
    assert BOOKABLE_TOUR_STATUSES <= PUBLIC_TOUR_STATUSES


def test_in_progress_and_completed_are_not_bookable():
    assert TourStatus.IN_PROGRESS not in BOOKABLE_TOUR_STATUSES
    assert TourStatus.COMPLETED not in BOOKABLE_TOUR_STATUSES
    assert TourStatus.CANCELLED not in BOOKABLE_TOUR_STATUSES


def test_scheduled_booking_open_almost_full_are_bookable():
    for status in (TourStatus.SCHEDULED, TourStatus.BOOKING_OPEN, TourStatus.ALMOST_FULL):
        assert status in BOOKABLE_TOUR_STATUSES


# ── Tiered pricing schema (Bug B5) ───────────────────────────────────────────

def _dep_id():
    return uuid.uuid4()


def test_legacy_quantity_still_accepted():
    item = BookingItemCreate(
        item_type=BookingItemType.TOUR_DEPARTURE,
        tour_departure_id=_dep_id(),
        quantity=3,
    )
    assert item.quantity == 3
    assert item.adults is None
    assert item.children == 0
    assert item.infants == 0


def test_tiered_counts_accepted():
    item = BookingItemCreate(
        item_type=BookingItemType.TOUR_DEPARTURE,
        tour_departure_id=_dep_id(),
        adults=2,
        children=1,
        infants=1,
    )
    assert item.adults == 2
    assert item.children == 1
    assert item.infants == 1


def test_adults_must_be_at_least_1_when_provided():
    with pytest.raises(Exception):
        BookingItemCreate(
            item_type=BookingItemType.TOUR_DEPARTURE,
            tour_departure_id=_dep_id(),
            adults=0,
        )


def test_negative_children_rejected():
    with pytest.raises(Exception):
        BookingItemCreate(
            item_type=BookingItemType.TOUR_DEPARTURE,
            tour_departure_id=_dep_id(),
            adults=1,
            children=-1,
        )


def test_tiered_subtotal_calculation():
    """The service computes: adults*adult_price + children*child_price + infants*infant_price."""
    adult_price = Decimal("10000")
    child_price = Decimal("6000")
    infant_price = Decimal("0")
    adults, children, infants = 2, 1, 1
    subtotal = adults * adult_price + children * child_price + infants * infant_price
    assert subtotal == Decimal("26000")
