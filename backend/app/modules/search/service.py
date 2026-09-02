import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.ranking import RankingFactors, composite_score, relevance_for
from app.modules.bookings.models import BookingItem, BookingItemStatus
from app.modules.locations import service as locations_service
from app.modules.locations.models import Location, LocationTag, TaggableEntityType
from app.modules.profiles.models import LocalExpertProfile
from app.modules.rentcar import service as rentcar_service
from app.modules.rentcar.models import Vehicle, VehicleStatus
from app.modules.reviews.models import Review
from app.modules.search.schemas import DestinationSummary, ExpertSearchResult
from app.modules.stays import service as stays_service
from app.modules.stays.models import Property, PropertyStatus
from app.modules.tours.models import Tour, TourDeparture, TourStatus
from app.modules.users.models import PartnerAccount, PartnerRole, PartnerRoleStatus, User


async def _room_type_covers_range(db: AsyncSession, room_type_id: uuid.UUID, check_in: date, check_out: date) -> bool:
    nights = (check_out - check_in).days
    if nights <= 0:
        return False
    rows = await stays_service.get_availability(db, room_type_id, check_in, check_out - timedelta(days=1))
    if len(rows) != nights:
        return False  # missing a date = not confirmed available
    return all(row.available_units >= 1 for row in rows)


async def search_stays(
    db: AsyncSession,
    location_ids: list[uuid.UUID] | None,
    check_in: date | None,
    check_out: date | None,
    guests: int,
) -> list[Property]:
    query = select(Property).where(Property.status == PropertyStatus.PUBLISHED).options(
        selectinload(Property.room_types), selectinload(Property.amenities), selectinload(Property.images)
    )
    if location_ids is not None:
        query = query.join(
            LocationTag,
            (LocationTag.entity_id == Property.id) & (LocationTag.entity_type == TaggableEntityType.PROPERTY),
        ).where(LocationTag.location_id.in_(location_ids))
    result = await db.execute(query.distinct())
    properties = list(result.scalars().all())

    if check_in is not None and check_out is not None:
        available = []
        for prop in properties:
            for room_type in prop.room_types:
                if room_type.max_occupancy < guests:
                    continue
                if await _room_type_covers_range(db, room_type.id, check_in, check_out):
                    available.append(prop)
                    break
        properties = available

    return await stays_service.rank_properties(db, properties, location_ids)


async def _vehicle_covers_range(db: AsyncSession, vehicle_id: uuid.UUID, pickup: date, return_: date) -> bool:
    days = (return_ - pickup).days
    if days <= 0:
        return False
    rows = await rentcar_service.get_availability(db, vehicle_id, pickup, return_ - timedelta(days=1))
    if len(rows) != days:
        return False
    return all(row.is_available for row in rows)


async def search_vehicles(
    db: AsyncSession, location_ids: list[uuid.UUID] | None, pickup: date | None, return_: date | None
) -> list[Vehicle]:
    query = select(Vehicle).where(Vehicle.status == VehicleStatus.PUBLISHED)
    if location_ids is not None:
        query = query.join(
            LocationTag, (LocationTag.entity_id == Vehicle.id) & (LocationTag.entity_type == TaggableEntityType.VEHICLE)
        ).where(LocationTag.location_id.in_(location_ids))
    result = await db.execute(query.distinct())
    vehicles = list(result.scalars().all())

    if pickup is not None and return_ is not None:
        vehicles = [v for v in vehicles if await _vehicle_covers_range(db, v.id, pickup, return_)]

    return await rentcar_service.rank_vehicles(db, vehicles, location_ids)


async def _successful_tour_counts(db: AsyncSession, role_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Completed tour-departure bookings per Local Expert role — MVP acceptance
    criterion #5 ("successful-tour count"). Empty dict short-circuits an otherwise
    harmless-but-pointless query when there are no experts to look up."""
    if not role_ids:
        return {}
    result = await db.execute(
        select(Tour.local_expert_role_id, func.count(BookingItem.id))
        .select_from(BookingItem)
        .join(TourDeparture, BookingItem.tour_departure_id == TourDeparture.id)
        .join(Tour, TourDeparture.tour_id == Tour.id)
        .where(BookingItem.status == BookingItemStatus.COMPLETED, Tour.local_expert_role_id.in_(role_ids))
        .group_by(Tour.local_expert_role_id)
    )
    return dict(result.all())


async def _expert_rating_map(db: AsyncSession, role_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    if not role_ids:
        return {}
    result = await db.execute(
        select(Tour.local_expert_role_id, func.avg(Review.rating))
        .join(Review, Review.tour_id == Tour.id)
        .where(Tour.local_expert_role_id.in_(role_ids))
        .group_by(Tour.local_expert_role_id)
    )
    return dict(result.all())


async def search_experts(db: AsyncSession, location_ids: list[uuid.UUID] | None) -> list[ExpertSearchResult]:
    """Ranked by core/ranking.py's composite score — `conversion` reuses the same
    completed-tour-booking count as MVP acceptance criterion #5's "successful-tour
    count", and `completeness` is the fraction of profile fields (headline/bio/years
    of experience/languages) an expert has actually filled in."""
    query = (
        select(LocalExpertProfile, User.full_name)
        .join(PartnerRole, LocalExpertProfile.partner_role_id == PartnerRole.id)
        .join(PartnerAccount, PartnerRole.partner_account_id == PartnerAccount.id)
        .join(User, PartnerAccount.user_id == User.id)
        .where(LocalExpertProfile.is_published.is_(True), PartnerRole.status == PartnerRoleStatus.APPROVED)
    )
    if location_ids is not None:
        query = query.join(
            LocationTag,
            (LocationTag.entity_id == PartnerRole.id) & (LocationTag.entity_type == TaggableEntityType.PARTNER_ROLE),
        ).where(LocationTag.location_id.in_(location_ids))

    result = await db.execute(query.distinct())
    rows = result.all()
    role_ids = [profile.partner_role_id for profile, _ in rows]
    tour_counts = await _successful_tour_counts(db, role_ids)
    ratings = await _expert_rating_map(db, role_ids)
    exact_match_ids = (
        await locations_service.get_exact_match_ids(db, TaggableEntityType.PARTNER_ROLE, role_ids, location_ids[0])
        if location_ids
        else set()
    )

    def score(profile: LocalExpertProfile) -> float:
        completeness_signals = [
            bool(profile.headline),
            bool(profile.bio),
            profile.years_experience is not None,
            bool(profile.languages),
        ]
        factors = RankingFactors(
            relevance=relevance_for(profile.partner_role_id, location_ids, exact_match_ids),
            rating=ratings.get(profile.partner_role_id),
            conversion_count=tour_counts.get(profile.partner_role_id, 0),
            completeness=sum(completeness_signals) / len(completeness_signals),
        )
        return composite_score(factors)

    rows = sorted(rows, key=lambda r: score(r[0]), reverse=True)
    return [
        ExpertSearchResult(
            partner_role_id=profile.partner_role_id,
            full_name=full_name,
            headline=profile.headline,
            bio=profile.bio,
            years_experience=profile.years_experience,
            languages=profile.languages,
            successful_tour_count=tour_counts.get(profile.partner_role_id, 0),
        )
        for profile, full_name in rows
    ]


async def get_destinations(db: AsyncSession) -> list[DestinationSummary]:
    """Locations that have at least one published tour or property tagged directly to
    them (not counting descendants — see resolve_slug_to_subtree_ids for that)."""
    tour_counts = dict(
        (
            await db.execute(
                select(LocationTag.location_id, func.count(Tour.id))
                .join(Tour, (Tour.id == LocationTag.entity_id) & (LocationTag.entity_type == TaggableEntityType.TOUR))
                .where(Tour.status == TourStatus.PUBLISHED)
                .group_by(LocationTag.location_id)
            )
        ).all()
    )
    property_counts = dict(
        (
            await db.execute(
                select(LocationTag.location_id, func.count(Property.id))
                .join(
                    Property,
                    (Property.id == LocationTag.entity_id) & (LocationTag.entity_type == TaggableEntityType.PROPERTY),
                )
                .where(Property.status == PropertyStatus.PUBLISHED)
                .group_by(LocationTag.location_id)
            )
        ).all()
    )
    vehicle_counts = dict(
        (
            await db.execute(
                select(LocationTag.location_id, func.count(Vehicle.id))
                .join(
                    Vehicle,
                    (Vehicle.id == LocationTag.entity_id) & (LocationTag.entity_type == TaggableEntityType.VEHICLE),
                )
                .where(Vehicle.status == VehicleStatus.PUBLISHED)
                .group_by(LocationTag.location_id)
            )
        ).all()
    )

    location_ids = set(tour_counts) | set(property_counts) | set(vehicle_counts)
    if not location_ids:
        return []

    result = await db.execute(select(Location).where(Location.id.in_(location_ids)))
    locations = result.scalars().all()
    return [
        DestinationSummary(
            id=loc.id,
            name=loc.name,
            slug=loc.slug,
            type=loc.type.value,
            published_tour_count=tour_counts.get(loc.id, 0),
            published_property_count=property_counts.get(loc.id, 0),
            published_vehicle_count=vehicle_counts.get(loc.id, 0),
        )
        for loc in locations
    ]
