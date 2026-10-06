import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import search_engine, storage
from app.core.exceptions import ConflictError, NotFoundError
from app.core.ranking import RankingFactors, composite_score, relevance_for
from app.core.slugs import slugify, unique_suffix
from app.modules.bookings.models import BookingItem, BookingItemStatus
from app.modules.fraud import service as fraud_service
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.reviews.models import Review
from app.modules.tours.models import (
    Tour,
    TourActivity,
    TourAddon,
    TourDeparture,
    TourImage,
    TourItineraryDay,
    TourMeal,
    TourStatus,
    TourStay,
    TourTransport,
)
from app.modules.tours.schemas import (
    ActivityCreate,
    AddonCreate,
    DepartureCreate,
    ItineraryDayCreate,
    MealCreate,
    TourCreate,
    TourStayCreate,
    TourUpdate,
    TransportCreate,
)
from app.modules.users.models import PartnerAccount, PartnerRole

_EAGER = (
    selectinload(Tour.itinerary),
    selectinload(Tour.departures),
    selectinload(Tour.meals),
    selectinload(Tour.activities),
    selectinload(Tour.addons),
    selectinload(Tour.transport),
    selectinload(Tour.stays),
    selectinload(Tour.images),
)

MAX_IMAGES_PER_TOUR = 10


async def _unique_slug(db: AsyncSession, title: str) -> str:
    base = slugify(title)
    slug = base
    while (await db.execute(select(Tour.id).where(Tour.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{unique_suffix()}"
    return slug


async def create_tour(db: AsyncSession, role: PartnerRole, payload: TourCreate) -> Tour:
    slug = await _unique_slug(db, payload.title)
    tour = Tour(local_expert_role_id=role.id, slug=slug, **payload.model_dump())
    db.add(tour)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour.id)


async def get_own_tour_or_404(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> Tour:
    # populate_existing=True: several service functions fetch, mutate a child collection,
    # commit, then re-fetch this same tour in the same session to build the response. Without
    # it, SQLAlchemy's identity map would hand back the first fetch's already-loaded (now
    # stale) collections instead of re-querying them, and the response would silently omit
    # whatever was just added.
    result = await db.execute(
        select(Tour)
        .where(Tour.id == tour_id, Tour.local_expert_role_id == role.id)
        .options(*_EAGER)
        .execution_options(populate_existing=True)
    )
    tour = result.scalar_one_or_none()
    if tour is None:
        raise NotFoundError("Tour not found")
    return tour


PUBLIC_TOUR_STATUSES = {
    TourStatus.PUBLISHED,
    TourStatus.BOOKING_OPEN,
    TourStatus.ALMOST_FULL,
    TourStatus.SOLD_OUT,
    TourStatus.CONFIRMED,
    TourStatus.IN_PROGRESS,
    TourStatus.COMPLETED,
    TourStatus.SCHEDULED,
}

# Subset of PUBLIC_TOUR_STATUSES that still accept new bookings (PRD §10.4 Bug B4).
# SOLD_OUT is included because the seat check in _reserve_tour_departure will catch it;
# IN_PROGRESS, COMPLETED, CANCELLED, etc. are excluded.
BOOKABLE_TOUR_STATUSES = {
    TourStatus.PUBLISHED,
    TourStatus.SCHEDULED,
    TourStatus.BOOKING_OPEN,
    TourStatus.ALMOST_FULL,
    TourStatus.SOLD_OUT,
    TourStatus.CONFIRMED,
}

# PRD 10.5: "Reapproval after material price, itinerary or safety changes." Only
# statuses where the tour is still upcoming and bookable are pulled back for
# re-review — editing safety notes on a tour that's IN_PROGRESS or COMPLETED
# can't un-happen the trip, so those are deliberately excluded.
REAPPROVAL_TRIGGER_STATUSES = {
    TourStatus.PUBLISHED,
    TourStatus.SCHEDULED,
    TourStatus.BOOKING_OPEN,
    TourStatus.ALMOST_FULL,
    TourStatus.SOLD_OUT,
    TourStatus.CONFIRMED,
}

MATERIAL_REAPPROVAL_FIELDS = {
    # Price
    "base_price", "child_price", "infant_price", "price_per_group",
    "single_room_supplement", "couple_price", "seasonal_pricing", "weekend_price",
    "early_bird_discount", "group_discount", "tax_rate", "service_charge_rate",
    "deposit_percentage", "payment_deadline_days",
    # Safety
    "first_aid_available", "nearest_hospital", "women_safety_notes",
    "child_safety_notes", "night_travel_policy", "permit_requirements",
    "insurance_included", "emergency_procedure",
}


async def get_tour_for_view(db: AsyncSession, tour_id: uuid.UUID, viewer_role: PartnerRole | None) -> Tour:
    """Published tours are visible to anyone; drafts/pending/rejected only to the owner."""
    result = await db.execute(
        select(Tour).where(Tour.id == tour_id).options(*_EAGER).execution_options(populate_existing=True)
    )
    tour = result.scalar_one_or_none()
    if tour is None:
        raise NotFoundError("Tour not found")
    if tour.status not in PUBLIC_TOUR_STATUSES:
        if viewer_role is None or tour.local_expert_role_id != viewer_role.id:
            raise NotFoundError("Tour not found")
    return tour


async def list_my_tours(db: AsyncSession, role: PartnerRole) -> list[Tour]:
    result = await db.execute(
        select(Tour).where(Tour.local_expert_role_id == role.id).options(*_EAGER).order_by(Tour.created_at.desc())
    )
    return list(result.scalars().all())


async def _tour_rating_map(db: AsyncSession, tour_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    if not tour_ids:
        return {}
    result = await db.execute(
        select(Review.tour_id, func.avg(Review.rating)).where(Review.tour_id.in_(tour_ids)).group_by(Review.tour_id)
    )
    return dict(result.all())


async def _tour_conversion_map(db: AsyncSession, tour_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not tour_ids:
        return {}
    result = await db.execute(
        select(Tour.id, func.count(BookingItem.id))
        .select_from(Tour)
        .join(TourDeparture, TourDeparture.tour_id == Tour.id)
        .join(BookingItem, BookingItem.tour_departure_id == TourDeparture.id)
        .where(Tour.id.in_(tour_ids), BookingItem.status == BookingItemStatus.COMPLETED)
        .group_by(Tour.id)
    )
    return dict(result.all())


async def list_published_tours(
    db: AsyncSession, location_ids: list[uuid.UUID] | None = None, search_query: str | None = None
) -> list[Tour]:
    """Ranked by core/ranking.py's composite score (relevance/rating/conversion/
    completeness) — see that module's docstring for the formula and what each factor
    means here. `created_at desc` is only the final tiebreaker now, not the primary
    order. `search_query`, if given, filters to matching tours via Elasticsearch
    (title/description) — see core/search_engine.py's module docstring for the
    plain-Postgres ILIKE fallback when Elasticsearch is unreachable. Filtering, not
    re-ranking: a text match doesn't feed into the composite score above, it only
    narrows which tours are scored at all."""
    from app.modules.locations.models import LocationTag

    query = (
        select(Tour)
        .where(
            Tour.status.in_([
                TourStatus.PUBLISHED,
                TourStatus.BOOKING_OPEN,
                TourStatus.ALMOST_FULL,
                TourStatus.SCHEDULED,
            ])
        )
        .options(selectinload(Tour.itinerary), selectinload(Tour.departures), selectinload(Tour.images))
    )
    if location_ids is not None:
        query = query.join(
            LocationTag,
            (LocationTag.entity_id == Tour.id) & (LocationTag.entity_type == TaggableEntityType.TOUR),
        ).where(LocationTag.location_id.in_(location_ids))
    if search_query:
        matched_ids = await search_engine.search_tour_ids(search_query)
        if matched_ids is not None:
            if not matched_ids:
                return []
            query = query.where(Tour.id.in_(matched_ids))
        else:
            pattern = f"%{search_query}%"
            query = query.where(Tour.title.ilike(pattern) | Tour.description.ilike(pattern))
    result = await db.execute(query.distinct())
    tours = list(result.scalars().all())
    if not tours:
        return tours

    tour_ids = [t.id for t in tours]
    ratings = await _tour_rating_map(db, tour_ids)
    conversions = await _tour_conversion_map(db, tour_ids)
    exact_match_ids = (
        await locations_service.get_exact_match_ids(db, TaggableEntityType.TOUR, tour_ids, location_ids[0])
        if location_ids
        else set()
    )
    today = date.today()

    def score(tour: Tour) -> float:
        completeness_signals = [
            bool(tour.description),
            bool(tour.itinerary),
            any(dep.departure_date >= today for dep in tour.departures),
        ]
        factors = RankingFactors(
            relevance=relevance_for(tour.id, location_ids, exact_match_ids),
            rating=ratings.get(tour.id),
            conversion_count=conversions.get(tour.id, 0),
            completeness=sum(completeness_signals) / len(completeness_signals),
        )
        return composite_score(factors)

    tours.sort(key=lambda t: (score(t), t.created_at), reverse=True)
    return tours


SIMILAR_TOURS_LIMIT = 6


async def similar_tours(db: AsyncSession, tour: Tour, limit: int = SIMILAR_TOURS_LIMIT) -> list[Tour]:
    """Content-based "similar tours" (Sprint 25-26 personalization): other PUBLISHED
    tours sharing at least one of `tour`'s own location tags, ranked by price
    closeness to `tour.base_price` — see core/recommendations.py's module docstring
    for why this scoring lives per-module rather than centrally. Tours have no
    category field, so price is the only similarity signal here (properties/vehicles
    add a same-category bonus)."""
    from app.modules.locations.models import LocationTag

    own_tags = await locations_service.get_tags(db, TaggableEntityType.TOUR, tour.id)
    location_ids = [t.location_id for t in own_tags]
    if not location_ids:
        return []

    result = await db.execute(
        select(Tour)
        .join(LocationTag, (LocationTag.entity_id == Tour.id) & (LocationTag.entity_type == TaggableEntityType.TOUR))
        .where(Tour.status == TourStatus.PUBLISHED, Tour.id != tour.id, LocationTag.location_id.in_(location_ids))
        .options(*_EAGER)
        .distinct()
    )
    candidates = list(result.scalars().all())
    if not candidates:
        return []

    def price_closeness(candidate: Tour) -> float:
        if tour.base_price == 0:
            return 0.5
        relative_gap = abs(float(candidate.base_price - tour.base_price)) / float(tour.base_price)
        return max(0.0, 1.0 - relative_gap)

    candidates.sort(key=price_closeness, reverse=True)
    return candidates[:limit]


async def update_tour(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: TourUpdate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    old_price = tour.base_price
    updates = payload.model_dump(exclude_unset=True)
    needs_reapproval = tour.status in REAPPROVAL_TRIGGER_STATUSES and any(
        field in MATERIAL_REAPPROVAL_FIELDS for field in updates
    )
    for field, value in updates.items():
        setattr(tour, field, value)
    if needs_reapproval:
        # PRD 10.5: a material price/safety change on an already-approved tour
        # pulls it back out of public listings until an admin re-reviews it,
        # rather than letting unreviewed changes go live silently.
        tour.status = TourStatus.SUBMITTED_FOR_REVIEW
        tour.rejection_reason = None
    await db.commit()
    if "base_price" in updates:
        await fraud_service.check_sudden_price_change(db, role.id, old_price, tour.base_price, tour.id, "Tour")
        await db.commit()
    if needs_reapproval:
        owner_user_id = (
            await db.execute(
                select(PartnerAccount.user_id)
                .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
                .where(PartnerRole.id == role.id)
            )
        ).scalar_one()
        await notifications_service.notify(
            db,
            user_id=owner_user_id,
            type=NotificationType.LISTING_CHANGES_REQUESTED,
            title="Tour pulled for re-approval",
            message=f'Your changes to "{tour.title}" affect price or safety details, so it needs admin re-approval before it\'s public again.',
            link=f"/dashboard/tours/{tour.id}",
        )
    if tour.status == TourStatus.PUBLISHED:
        await search_engine.index_tour(tour.id, tour.title, tour.description, tour.base_price)
    return await get_own_tour_or_404(db, role, tour_id)


async def delete_tour(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> None:
    tour = await get_own_tour_or_404(db, role, tour_id)
    if tour.status != TourStatus.DRAFT:
        raise ConflictError("Only draft tours can be deleted — reject or unpublish first")
    await db.delete(tour)
    await db.commit()


def _require_editable(tour: Tour) -> None:
    if tour.status in (TourStatus.PENDING_REVIEW, TourStatus.SUBMITTED_FOR_REVIEW):
        raise ConflictError("Tour is pending review — cannot be edited until it's approved or rejected")


async def add_itinerary_day(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: ItineraryDayCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourItineraryDay(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_departure(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: DepartureCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourDeparture(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_meal(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: MealCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourMeal(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_activity(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: ActivityCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourActivity(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_addon(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: AddonCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourAddon(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_transport(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: TransportCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourTransport(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_stay(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, payload: TourStayCreate) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    db.add(TourStay(tour_id=tour.id, **payload.model_dump()))
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def add_image(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, file_name: str, content_type: str, data: bytes
) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    if len(tour.images) >= MAX_IMAGES_PER_TOUR:
        raise ConflictError(f"A tour can have at most {MAX_IMAGES_PER_TOUR} images")
    storage.validate_image(content_type, len(data))

    key = storage.build_key(f"tours/{tour.id}", file_name)
    storage.upload_bytes(key, data, content_type)
    db.add(
        TourImage(
            tour_id=tour.id,
            storage_key=key,
            content_type=content_type,
            file_name=file_name,
            sort_order=len(tour.images),
        )
    )
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def delete_image(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, image_id: uuid.UUID) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    result = await db.execute(select(TourImage).where(TourImage.id == image_id, TourImage.tour_id == tour.id))
    image = result.scalar_one_or_none()
    if image is None:
        raise NotFoundError("Image not found")
    storage.delete_object(image.storage_key)
    await db.delete(image)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def get_image_or_404(db: AsyncSession, tour_id: uuid.UUID, image_id: uuid.UUID) -> TourImage:
    result = await db.execute(select(TourImage).where(TourImage.id == image_id, TourImage.tour_id == tour_id))
    image = result.scalar_one_or_none()
    if image is None:
        raise NotFoundError("Image not found")
    return image


_CHILD_MODELS = {
    "itinerary": TourItineraryDay,
    "departures": TourDeparture,
    "meals": TourMeal,
    "activities": TourActivity,
    "addons": TourAddon,
    "transport": TourTransport,
    "stays": TourStay,
}


async def delete_child(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, child_type: str, child_id: uuid.UUID
) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    _require_editable(tour)
    model = _CHILD_MODELS[child_type]
    result = await db.execute(select(model).where(model.id == child_id, model.tour_id == tour.id))
    item = result.scalar_one_or_none()
    if item is None:
        raise NotFoundError("Item not found")
    await db.delete(item)
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def submit_for_review(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> Tour:
    from app.modules.profiles.models import LocalExpertProfile

    tour = await get_own_tour_or_404(db, role, tour_id)
    if tour.status not in (TourStatus.DRAFT, TourStatus.REJECTED, TourStatus.CHANGES_REQUESTED):
        raise ConflictError(f"Tour is {tour.status.value} — cannot be resubmitted")
    if not tour.itinerary:
        raise ConflictError("Add at least one itinerary day before submitting")
    if not tour.departures:
        raise ConflictError("Add at least one departure date before submitting")
    if not await locations_service.has_tags(db, TaggableEntityType.TOUR, tour.id):
        raise ConflictError("Tag at least one destination before submitting")

    # PRD §10.5 auto-approval: trusted experts bypass manual review for tours
    # with no high-risk activities. The admin still sees the tour in the
    # "recently auto-approved" list and can suspend it.
    has_high_risk = any(a.is_high_risk for a in (tour.activities or []))
    profile = (
        await db.execute(select(LocalExpertProfile).where(LocalExpertProfile.partner_role_id == role.id))
    ).scalar_one_or_none()
    is_trusted = bool(profile and profile.is_trusted)

    if is_trusted and not has_high_risk:
        tour.status = TourStatus.PUBLISHED
        tour.rejection_reason = None
        await db.commit()
        await search_engine.index_tour(tour.id, tour.title, tour.description, tour.base_price)
        await notifications_service.notify(
            db,
            user_id=role.partner_account.user_id,
            type=NotificationType.LISTING_APPROVED,
            title="Tour published automatically",
            message=f'Your tour "{tour.title}" has been published automatically — you are a trusted expert.',
            link=f"/tours/{tour.id}",
        )
    else:
        tour.status = TourStatus.SUBMITTED_FOR_REVIEW
        tour.rejection_reason = None
        await db.commit()

    return await get_own_tour_or_404(db, role, tour_id)


async def duplicate_tour(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> Tour:
    source = await get_own_tour_or_404(db, role, tour_id)
    new_title = f"{source.title} (Copy)"
    slug = await _unique_slug(db, new_title)

    cloned = Tour(
        local_expert_role_id=role.id,
        title=new_title,
        slug=slug,
        description=source.description,
        short_summary=source.short_summary,
        duration_days=source.duration_days,
        duration_nights=source.duration_nights,
        base_price=source.base_price,
        min_group_size=source.min_group_size,
        max_group_size=source.max_group_size,
        status=TourStatus.DRAFT,
        tour_type=source.tour_type,
        suitable_traveler_type=source.suitable_traveler_type,
        primary_destination_id=source.primary_destination_id,
        child_price=source.child_price,
        infant_price=source.infant_price,
        price_per_group=source.price_per_group,
        single_room_supplement=source.single_room_supplement,
        couple_price=source.couple_price,
        seasonal_pricing=source.seasonal_pricing,
        weekend_price=source.weekend_price,
        early_bird_discount=source.early_bird_discount,
        group_discount=source.group_discount,
        currency=source.currency,
        tax_rate=source.tax_rate,
        service_charge_rate=source.service_charge_rate,
        deposit_percentage=source.deposit_percentage,
        payment_deadline_days=source.payment_deadline_days,
        included_services=source.included_services,
        excluded_services=source.excluded_services,
        pickup_location=source.pickup_location,
        pickup_time=source.pickup_time,
        dropoff_location=source.dropoff_location,
        dropoff_time=source.dropoff_time,
        pickup_coordinates=source.pickup_coordinates,
        pickup_window=source.pickup_window,
        pickup_contact_person=source.pickup_contact_person,
        home_hotel_pickup_available=source.home_hotel_pickup_available,
        home_pickup_extra_charge=source.home_pickup_extra_charge,
        late_arrival_policy=source.late_arrival_policy,
        nearest_hospital=source.nearest_hospital,
        first_aid_available=source.first_aid_available,
        women_safety_notes=source.women_safety_notes,
        child_safety_notes=source.child_safety_notes,
        night_travel_policy=source.night_travel_policy,
        permit_requirements=source.permit_requirements,
        insurance_included=source.insurance_included,
        emergency_procedure=source.emergency_procedure,
        emergency_contact_phone=source.emergency_contact_phone,
        weather_risk_note=source.weather_risk_note,
        activity_risk_note=source.activity_risk_note,
        cancellation_policy=source.cancellation_policy,
        refund_policy=source.refund_policy,
        child_policy=source.child_policy,
        rescheduling_policy=source.rescheduling_policy,
        min_participant_policy=source.min_participant_policy,
        bad_weather_policy=source.bad_weather_policy,
        no_show_policy=source.no_show_policy,
        pet_policy=source.pet_policy,
        accessibility_policy=source.accessibility_policy,
        traveler_conduct_policy=source.traveler_conduct_policy,
    )
    db.add(cloned)
    await db.flush()

    for day in source.itinerary:
        db.add(
            TourItineraryDay(
                tour_id=cloned.id,
                day_number=day.day_number,
                title=day.title,
                description=day.description,
                location_name=day.location_name,
                arrival_time=day.arrival_time,
                departure_time=day.departure_time,
                activity_summary=day.activity_summary,
                entry_fee_included=day.entry_fee_included,
                accessibility_notes=day.accessibility_notes,
                safety_notes=day.safety_notes,
            )
        )

    for meal in source.meals:
        db.add(
            TourMeal(
                tour_id=cloned.id,
                day_number=meal.day_number,
                meal_type=meal.meal_type,
                description=meal.description,
                is_vegetarian=meal.is_vegetarian,
                is_vegan=meal.is_vegan,
                is_halal=meal.is_halal,
                allergy_notes=meal.allergy_notes,
                children_menu_available=meal.children_menu_available,
                restaurant_provider=meal.restaurant_provider,
                optional_upgrade_price=meal.optional_upgrade_price,
            )
        )

    for act in source.activities:
        db.add(
            TourActivity(
                tour_id=cloned.id,
                day_number=act.day_number,
                name=act.name,
                description=act.description,
                is_included=act.is_included,
                duration_hours=act.duration_hours,
                location_name=act.location_name,
                difficulty=act.difficulty,
                min_age=act.min_age,
                equipment_needed=act.equipment_needed,
                max_capacity=act.max_capacity,
                safety_notes=act.safety_notes,
                guide_required=act.guide_required,
                is_high_risk=act.is_high_risk,
                weather_dependency=act.weather_dependency,
                addon_price=act.addon_price,
            )
        )

    for addon in source.addons:
        db.add(
            TourAddon(
                tour_id=cloned.id,
                name=addon.name,
                description=addon.description,
                price=addon.price,
            )
        )

    for tr in source.transport:
        db.add(
            TourTransport(
                tour_id=cloned.id,
                mode=tr.mode,
                description=tr.description,
                provider_name=tr.provider_name,
                vehicle_type=tr.vehicle_type,
                vehicle_model=tr.vehicle_model,
                driver_included=tr.driver_included,
                has_ac=tr.has_ac,
                capacity=tr.capacity,
                driver_name=tr.driver_name,
                intercity_details=tr.intercity_details,
                local_details=tr.local_details,
                pickup_location=tr.pickup_location,
                pickup_time=tr.pickup_time,
                dropoff_location=tr.dropoff_location,
                dropoff_time=tr.dropoff_time,
                route_info=tr.route_info,
                luggage_policy=tr.luggage_policy,
            )
        )

    for stay in source.stays:
        db.add(
            TourStay(
                tour_id=cloned.id,
                property_id=stay.property_id,
                stay_name=stay.stay_name,
                description=stay.description,
                nights=stay.nights,
                property_type=stay.property_type,
                room_category=stay.room_category,
                occupancy_arrangement=stay.occupancy_arrangement,
                room_sharing_policy=stay.room_sharing_policy,
                check_in_out_info=stay.check_in_out_info,
                stay_location=stay.stay_location,
                stay_photos=stay.stay_photos,
                source_type=stay.source_type,
            )
        )

    existing_tags = await locations_service.get_tags(db, TaggableEntityType.TOUR, source.id)
    if existing_tags:
        await locations_service.set_tags(db, TaggableEntityType.TOUR, cloned.id, [t.location_id for t in existing_tags])

    await db.commit()
    return await get_own_tour_or_404(db, role, cloned.id)


async def close_bookings(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    tour.status = TourStatus.SOLD_OUT
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def update_tour_status(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, new_status: TourStatus, reason: str | None = None
) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    tour.status = new_status
    if reason is not None:
        tour.rejection_reason = reason
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def cancel_departure(db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, dep_id: uuid.UUID) -> Tour:
    tour = await get_own_tour_or_404(db, role, tour_id)
    result = await db.execute(select(TourDeparture).where(TourDeparture.id == dep_id, TourDeparture.tour_id == tour.id))
    dep = result.scalar_one_or_none()
    if dep is None:
        raise NotFoundError("Departure not found")
    dep.status = "cancelled"
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def assign_departure_guide(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, dep_id: uuid.UUID, guide_role_id: uuid.UUID, fee_amount: Decimal | None
) -> Tour:
    from app.modules.guides import service as guides_service
    from app.modules.guides.schemas import AssignmentCreate

    tour = await get_own_tour_or_404(db, role, tour_id)
    result = await db.execute(select(TourDeparture).where(TourDeparture.id == dep_id, TourDeparture.tour_id == tour.id))
    dep = result.scalar_one_or_none()
    if dep is None:
        raise NotFoundError("Departure not found")

    await guides_service.assign_guide(
        db, role, guide_role_id, AssignmentCreate(tour_departure_id=dep.id, fee_amount=fee_amount)
    )
    dep.assigned_guide_role_id = guide_role_id
    await db.commit()
    return await get_own_tour_or_404(db, role, tour_id)


async def get_departure_travelers(
    db: AsyncSession, role: PartnerRole, tour_id: uuid.UUID, dep_id: uuid.UUID
) -> list[dict]:
    tour = await get_own_tour_or_404(db, role, tour_id)
    result = await db.execute(select(TourDeparture).where(TourDeparture.id == dep_id, TourDeparture.tour_id == tour.id))
    dep = result.scalar_one_or_none()
    if dep is None:
        raise NotFoundError("Departure not found")

    from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType
    from app.modules.users.models import User

    b_result = await db.execute(
        select(BookingItem, Booking, User)
        .join(Booking, Booking.id == BookingItem.booking_id)
        .join(User, User.id == Booking.user_id)
        .where(
            BookingItem.tour_departure_id == dep.id,
            BookingItem.status != BookingItemStatus.CANCELLED,
        )
    )
    rows = b_result.all()
    travelers = []
    for item, booking, user in rows:
        travelers.append({
            "booking_id": booking.id,
            "booking_item_id": item.id,
            "traveler_name": user.full_name,
            "traveler_email": user.email,
            "traveler_phone": getattr(user, "phone_number", None),
            "seats": item.quantity,
            "status": item.status.value,
            "booked_at": booking.created_at,
        })
    return travelers
