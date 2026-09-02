import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.ranking import RankingFactors, composite_score, relevance_for
from app.modules.bookings.models import BookingItem, BookingItemStatus
from app.modules.locations import service as locations_service
from app.modules.locations.models import LocationTag, TaggableEntityType
from app.modules.rentcar.models import Driver, Vehicle, VehicleAvailability, VehicleStatus
from app.modules.rentcar.schemas import DriverCreate, VehicleAvailabilityRangeSet, VehicleCreate, VehicleUpdate
from app.modules.users.models import PartnerRole


async def create_driver(db: AsyncSession, role: PartnerRole, payload: DriverCreate) -> Driver:
    driver = Driver(rent_a_car_role_id=role.id, **payload.model_dump())
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return driver


async def list_my_drivers(db: AsyncSession, role: PartnerRole) -> list[Driver]:
    result = await db.execute(
        select(Driver).where(Driver.rent_a_car_role_id == role.id).order_by(Driver.created_at.desc())
    )
    return list(result.scalars().all())


async def _get_own_driver_or_404(db: AsyncSession, role: PartnerRole, driver_id: uuid.UUID) -> Driver:
    result = await db.execute(
        select(Driver).where(Driver.id == driver_id, Driver.rent_a_car_role_id == role.id)
    )
    driver = result.scalar_one_or_none()
    if driver is None:
        raise NotFoundError("Driver not found")
    return driver


async def update_driver(db: AsyncSession, role: PartnerRole, driver_id: uuid.UUID, is_available: bool) -> Driver:
    driver = await _get_own_driver_or_404(db, role, driver_id)
    driver.is_available = is_available
    await db.commit()
    await db.refresh(driver)
    return driver


async def delete_driver(db: AsyncSession, role: PartnerRole, driver_id: uuid.UUID) -> None:
    driver = await _get_own_driver_or_404(db, role, driver_id)
    await db.delete(driver)
    await db.commit()


async def create_vehicle(db: AsyncSession, role: PartnerRole, payload: VehicleCreate) -> Vehicle:
    vehicle = Vehicle(rent_a_car_role_id=role.id, **payload.model_dump())
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


async def get_own_vehicle_or_404(db: AsyncSession, role: PartnerRole, vehicle_id: uuid.UUID) -> Vehicle:
    result = await db.execute(
        select(Vehicle)
        .where(Vehicle.id == vehicle_id, Vehicle.rent_a_car_role_id == role.id)
        .execution_options(populate_existing=True)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise NotFoundError("Vehicle not found")
    return vehicle


async def get_vehicle_for_view(db: AsyncSession, vehicle_id: uuid.UUID, viewer_role: PartnerRole | None) -> Vehicle:
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise NotFoundError("Vehicle not found")
    if vehicle.status != VehicleStatus.PUBLISHED:
        if viewer_role is None or vehicle.rent_a_car_role_id != viewer_role.id:
            raise NotFoundError("Vehicle not found")
    return vehicle


async def list_my_vehicles(db: AsyncSession, role: PartnerRole) -> list[Vehicle]:
    result = await db.execute(
        select(Vehicle).where(Vehicle.rent_a_car_role_id == role.id).order_by(Vehicle.created_at.desc())
    )
    return list(result.scalars().all())


async def _vehicle_conversion_map(db: AsyncSession, vehicle_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not vehicle_ids:
        return {}
    result = await db.execute(
        select(BookingItem.vehicle_id, func.count(BookingItem.id))
        .where(BookingItem.vehicle_id.in_(vehicle_ids), BookingItem.status == BookingItemStatus.COMPLETED)
        .group_by(BookingItem.vehicle_id)
    )
    return dict(result.all())


async def rank_vehicles(db: AsyncSession, vehicles: list[Vehicle], location_ids: list[uuid.UUID] | None) -> list[Vehicle]:
    """Ranked by core/ranking.py's composite score. `rating` is always None here —
    Review has no vehicle_id column in this schema, so rent-a-car ranking relies on
    relevance/conversion/completeness only (documented in core/ranking.py). Shared by
    this module's own public listing and search/service.py's date-filtered search so
    both surfaces rank the same way."""
    if not vehicles:
        return vehicles

    vehicle_ids = [v.id for v in vehicles]
    conversions = await _vehicle_conversion_map(db, vehicle_ids)
    exact_match_ids = (
        await locations_service.get_exact_match_ids(db, TaggableEntityType.VEHICLE, vehicle_ids, location_ids[0])
        if location_ids
        else set()
    )

    def score(vehicle: Vehicle) -> float:
        factors = RankingFactors(
            relevance=relevance_for(vehicle.id, location_ids, exact_match_ids),
            rating=None,
            conversion_count=conversions.get(vehicle.id, 0),
            completeness=1.0 if vehicle.description else 0.0,
        )
        return composite_score(factors)

    vehicles.sort(key=lambda v: (score(v), v.created_at), reverse=True)
    return vehicles


async def list_published_vehicles(db: AsyncSession, location_ids: list[uuid.UUID] | None = None) -> list[Vehicle]:
    query = select(Vehicle).where(Vehicle.status == VehicleStatus.PUBLISHED)
    if location_ids is not None:
        query = query.join(
            LocationTag, (LocationTag.entity_id == Vehicle.id) & (LocationTag.entity_type == TaggableEntityType.VEHICLE)
        ).where(LocationTag.location_id.in_(location_ids))
    result = await db.execute(query.distinct())
    vehicles = list(result.scalars().all())
    return await rank_vehicles(db, vehicles, location_ids)


async def update_vehicle(db: AsyncSession, role: PartnerRole, vehicle_id: uuid.UUID, payload: VehicleUpdate) -> Vehicle:
    vehicle = await get_own_vehicle_or_404(db, role, vehicle_id)
    if vehicle.status == VehicleStatus.PENDING_REVIEW:
        raise ConflictError("Vehicle is pending review — cannot be edited until it's approved or rejected")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)
    await db.commit()
    return await get_own_vehicle_or_404(db, role, vehicle_id)


async def delete_vehicle(db: AsyncSession, role: PartnerRole, vehicle_id: uuid.UUID) -> None:
    vehicle = await get_own_vehicle_or_404(db, role, vehicle_id)
    if vehicle.status != VehicleStatus.DRAFT:
        raise ConflictError("Only draft vehicles can be deleted")
    await db.delete(vehicle)
    await db.commit()


async def submit_for_review(db: AsyncSession, role: PartnerRole, vehicle_id: uuid.UUID) -> Vehicle:
    vehicle = await get_own_vehicle_or_404(db, role, vehicle_id)
    if vehicle.status not in (VehicleStatus.DRAFT, VehicleStatus.REJECTED):
        raise ConflictError(f"Vehicle is {vehicle.status.value} — cannot be resubmitted")
    if not await locations_service.has_tags(db, TaggableEntityType.VEHICLE, vehicle.id):
        raise ConflictError("Tag at least one destination before submitting")

    vehicle.status = VehicleStatus.PENDING_REVIEW
    vehicle.rejection_reason = None
    await db.commit()
    return await get_own_vehicle_or_404(db, role, vehicle_id)


async def _assert_owns_vehicle(db: AsyncSession, role: PartnerRole, vehicle_id: uuid.UUID) -> Vehicle:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.rent_a_car_role_id == role.id)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise NotFoundError("Vehicle not found")
    return vehicle


async def set_availability_range(db: AsyncSession, role: PartnerRole, payload: VehicleAvailabilityRangeSet) -> None:
    await _assert_owns_vehicle(db, role, payload.vehicle_id)

    day = payload.start_date
    rows = []
    while day <= payload.end_date:
        rows.append({"id": uuid.uuid4(), "vehicle_id": payload.vehicle_id, "date": day, "is_available": payload.is_available})
        day += timedelta(days=1)

    stmt = pg_insert(VehicleAvailability).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["vehicle_id", "date"], set_={"is_available": stmt.excluded.is_available}
    )
    await db.execute(stmt)
    await db.commit()


async def get_availability(db: AsyncSession, vehicle_id: uuid.UUID, start_date: date, end_date: date) -> list[VehicleAvailability]:
    result = await db.execute(
        select(VehicleAvailability)
        .where(VehicleAvailability.vehicle_id == vehicle_id, VehicleAvailability.date >= start_date, VehicleAvailability.date <= end_date)
        .order_by(VehicleAvailability.date)
    )
    return list(result.scalars().all())
