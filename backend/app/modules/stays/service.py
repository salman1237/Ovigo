import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import storage
from app.core.exceptions import ConflictError, NotFoundError
from app.core.slugs import slugify, unique_suffix
from app.modules.locations import service as locations_service
from app.modules.locations.models import TaggableEntityType
from app.modules.stays.models import (
    AvailabilityCalendar,
    Property,
    PropertyAmenity,
    PropertyImage,
    PropertyStatus,
    RatePlan,
    RatePlanAdjustmentType,
    RoomType,
)
from app.modules.stays.schemas import (
    AmenitySet,
    AvailabilityRangeSet,
    PropertyCreate,
    PropertyUpdate,
    RatePlanCreate,
    RatePlanUpdate,
    RoomTypeCreate,
    RoomTypeUpdate,
)
from app.modules.users.models import PartnerRole

_EAGER = (selectinload(Property.room_types), selectinload(Property.amenities), selectinload(Property.images))

MAX_IMAGES_PER_PROPERTY = 15


async def _unique_slug(db: AsyncSession, name: str) -> str:
    base = slugify(name)
    slug = base
    while (await db.execute(select(Property.id).where(Property.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{unique_suffix()}"
    return slug


async def create_property(db: AsyncSession, role: PartnerRole, payload: PropertyCreate) -> Property:
    slug = await _unique_slug(db, payload.name)
    property_ = Property(host_role_id=role.id, slug=slug, **payload.model_dump())
    db.add(property_)
    await db.commit()
    return await get_own_property_or_404(db, role, property_.id)


async def get_own_property_or_404(db: AsyncSession, role: PartnerRole, property_id: uuid.UUID) -> Property:
    # populate_existing=True — see the matching comment in tours/service.py:get_own_tour_or_404;
    # same identity-map staleness risk applies here (add_room_type, set_amenities, ...).
    result = await db.execute(
        select(Property)
        .where(Property.id == property_id, Property.host_role_id == role.id)
        .options(*_EAGER)
        .execution_options(populate_existing=True)
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise NotFoundError("Property not found")
    return prop


async def get_property_for_view(db: AsyncSession, property_id: uuid.UUID, viewer_role: PartnerRole | None) -> Property:
    result = await db.execute(
        select(Property).where(Property.id == property_id).options(*_EAGER).execution_options(populate_existing=True)
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise NotFoundError("Property not found")
    if prop.status != PropertyStatus.PUBLISHED:
        if viewer_role is None or prop.host_role_id != viewer_role.id:
            raise NotFoundError("Property not found")
    return prop


async def list_my_properties(db: AsyncSession, role: PartnerRole) -> list[Property]:
    result = await db.execute(
        select(Property).where(Property.host_role_id == role.id).options(*_EAGER).order_by(Property.created_at.desc())
    )
    return list(result.scalars().all())


async def list_published_properties(db: AsyncSession, location_ids: list[uuid.UUID] | None = None) -> list[Property]:
    query = select(Property).where(Property.status == PropertyStatus.PUBLISHED)
    if location_ids is not None:
        from app.modules.locations.models import LocationTag

        query = query.join(
            LocationTag,
            (LocationTag.entity_id == Property.id) & (LocationTag.entity_type == TaggableEntityType.PROPERTY),
        ).where(LocationTag.location_id.in_(location_ids))
    result = await db.execute(query.options(*_EAGER).order_by(Property.created_at.desc()).distinct())
    return list(result.scalars().all())


async def update_property(
    db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, payload: PropertyUpdate
) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def delete_property(db: AsyncSession, role: PartnerRole, property_id: uuid.UUID) -> None:
    prop = await get_own_property_or_404(db, role, property_id)
    if prop.status != PropertyStatus.DRAFT:
        raise ConflictError("Only draft properties can be deleted")
    await db.delete(prop)
    await db.commit()


def _require_editable(prop: Property) -> None:
    if prop.status == PropertyStatus.PENDING_REVIEW:
        raise ConflictError("Property is pending review — cannot be edited until it's approved or rejected")


async def add_room_type(
    db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, payload: RoomTypeCreate
) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    _require_editable(prop)
    db.add(RoomType(property_id=prop.id, **payload.model_dump()))
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def update_room_type(
    db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, room_type_id: uuid.UUID, payload: RoomTypeUpdate
) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    _require_editable(prop)
    result = await db.execute(select(RoomType).where(RoomType.id == room_type_id, RoomType.property_id == prop.id))
    room_type = result.scalar_one_or_none()
    if room_type is None:
        raise NotFoundError("Room type not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(room_type, field, value)
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def add_image(
    db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, file_name: str, content_type: str, data: bytes
) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    _require_editable(prop)
    if len(prop.images) >= MAX_IMAGES_PER_PROPERTY:
        raise ConflictError(f"A property can have at most {MAX_IMAGES_PER_PROPERTY} images")
    storage.validate_image(content_type, len(data))

    key = storage.build_key(f"properties/{prop.id}", file_name)
    storage.upload_bytes(key, data, content_type)
    db.add(
        PropertyImage(
            property_id=prop.id,
            storage_key=key,
            content_type=content_type,
            file_name=file_name,
            sort_order=len(prop.images),
        )
    )
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def delete_image(db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, image_id: uuid.UUID) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    _require_editable(prop)
    result = await db.execute(
        select(PropertyImage).where(PropertyImage.id == image_id, PropertyImage.property_id == prop.id)
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise NotFoundError("Image not found")
    storage.delete_object(image.storage_key)
    await db.delete(image)
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def get_image_or_404(db: AsyncSession, property_id: uuid.UUID, image_id: uuid.UUID) -> PropertyImage:
    result = await db.execute(
        select(PropertyImage).where(PropertyImage.id == image_id, PropertyImage.property_id == property_id)
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise NotFoundError("Image not found")
    return image


async def delete_room_type(db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, room_type_id: uuid.UUID) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    _require_editable(prop)
    result = await db.execute(select(RoomType).where(RoomType.id == room_type_id, RoomType.property_id == prop.id))
    room_type = result.scalar_one_or_none()
    if room_type is None:
        raise NotFoundError("Room type not found")
    await db.delete(room_type)
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def set_amenities(db: AsyncSession, role: PartnerRole, property_id: uuid.UUID, payload: AmenitySet) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    _require_editable(prop)
    await db.execute(PropertyAmenity.__table__.delete().where(PropertyAmenity.property_id == prop.id))
    db.add_all(PropertyAmenity(property_id=prop.id, amenity=a) for a in dict.fromkeys(payload.amenities))
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def _assert_owns_room_type(db: AsyncSession, role: PartnerRole, room_type_id: uuid.UUID) -> RoomType:
    result = await db.execute(
        select(RoomType)
        .join(Property, RoomType.property_id == Property.id)
        .where(RoomType.id == room_type_id, Property.host_role_id == role.id)
    )
    room_type = result.scalar_one_or_none()
    if room_type is None:
        raise NotFoundError("Room type not found")
    return room_type


async def set_availability_range(db: AsyncSession, role: PartnerRole, payload: AvailabilityRangeSet) -> None:
    await _assert_owns_room_type(db, role, payload.room_type_id)
    if payload.end_date < payload.start_date:
        raise ConflictError("end_date must be on or after start_date")

    day = payload.start_date
    rows = []
    while day <= payload.end_date:
        rows.append(
            {
                "id": uuid.uuid4(),
                "room_type_id": payload.room_type_id,
                "date": day,
                "available_units": payload.available_units,
                "price_override": payload.price_override,
            }
        )
        day += timedelta(days=1)

    stmt = pg_insert(AvailabilityCalendar).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["room_type_id", "date"],
        set_={"available_units": stmt.excluded.available_units, "price_override": stmt.excluded.price_override},
    )
    await db.execute(stmt)
    await db.commit()


async def get_availability(
    db: AsyncSession, room_type_id: uuid.UUID, start_date: date, end_date: date
) -> list[AvailabilityCalendar]:
    result = await db.execute(
        select(AvailabilityCalendar)
        .where(
            AvailabilityCalendar.room_type_id == room_type_id,
            AvailabilityCalendar.date >= start_date,
            AvailabilityCalendar.date <= end_date,
        )
        .order_by(AvailabilityCalendar.date)
    )
    return list(result.scalars().all())


async def submit_for_review(db: AsyncSession, role: PartnerRole, property_id: uuid.UUID) -> Property:
    prop = await get_own_property_or_404(db, role, property_id)
    if prop.status not in (PropertyStatus.DRAFT, PropertyStatus.REJECTED):
        raise ConflictError(f"Property is {prop.status.value} — cannot be resubmitted")
    if not prop.room_types:
        raise ConflictError("Add at least one room type before submitting")
    if not await locations_service.has_tags(db, TaggableEntityType.PROPERTY, prop.id):
        raise ConflictError("Tag at least one destination before submitting")

    prop.status = PropertyStatus.PENDING_REVIEW
    prop.rejection_reason = None
    await db.commit()
    return await get_own_property_or_404(db, role, property_id)


async def create_rate_plan(
    db: AsyncSession, role: PartnerRole, room_type_id: uuid.UUID, payload: RatePlanCreate
) -> RatePlan:
    await _assert_owns_room_type(db, role, room_type_id)
    plan = RatePlan(room_type_id=room_type_id, **payload.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


async def list_rate_plans(db: AsyncSession, role: PartnerRole, room_type_id: uuid.UUID) -> list[RatePlan]:
    await _assert_owns_room_type(db, role, room_type_id)
    result = await db.execute(
        select(RatePlan).where(RatePlan.room_type_id == room_type_id).order_by(RatePlan.created_at.desc())
    )
    return list(result.scalars().all())


async def _get_own_rate_plan_or_404(
    db: AsyncSession, role: PartnerRole, room_type_id: uuid.UUID, rate_plan_id: uuid.UUID
) -> RatePlan:
    await _assert_owns_room_type(db, role, room_type_id)
    result = await db.execute(
        select(RatePlan).where(RatePlan.id == rate_plan_id, RatePlan.room_type_id == room_type_id)
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundError("Rate plan not found")
    return plan


async def update_rate_plan(
    db: AsyncSession, role: PartnerRole, room_type_id: uuid.UUID, rate_plan_id: uuid.UUID, payload: RatePlanUpdate
) -> RatePlan:
    plan = await _get_own_rate_plan_or_404(db, role, room_type_id, rate_plan_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return plan


async def delete_rate_plan(db: AsyncSession, role: PartnerRole, room_type_id: uuid.UUID, rate_plan_id: uuid.UUID) -> None:
    plan = await _get_own_rate_plan_or_404(db, role, room_type_id, rate_plan_id)
    await db.delete(plan)
    await db.commit()


def _plan_applies(plan: RatePlan, night: date, days_before_checkin: int, quantity: int) -> bool:
    if not plan.is_active:
        return False
    if plan.start_date and night < plan.start_date:
        return False
    if plan.end_date and night > plan.end_date:
        return False
    if plan.applies_to_weekends and night.weekday() not in (4, 5):  # weekend nights = Friday, Saturday (weekday() 4, 5)
        return False
    if plan.min_days_before_checkin is not None and days_before_checkin < plan.min_days_before_checkin:
        return False
    if plan.min_quantity is not None and quantity < plan.min_quantity:
        return False
    return True


def _apply_adjustment(base_price: Decimal, plan: RatePlan) -> Decimal:
    if plan.adjustment_type == RatePlanAdjustmentType.FIXED_PRICE:
        return plan.adjustment_value
    adjusted = base_price * (Decimal("1") + plan.adjustment_value / Decimal("100"))
    return max(adjusted, Decimal("0"))


async def resolve_nightly_rate(
    db: AsyncSession,
    room_type_id: uuid.UUID,
    base_price: Decimal,
    night: date,
    days_before_checkin: int,
    quantity: int,
) -> Decimal:
    """The price for one night of one room, after rate plans. Cheapest-applicable-plan-wins
    (see stays/models.py module docstring) — callers should check
    AvailabilityCalendar.price_override FIRST and skip this call entirely if one is set,
    since a manual per-date override always outranks a rate plan.
    """
    result = await db.execute(
        select(RatePlan).where(RatePlan.room_type_id == room_type_id, RatePlan.is_active.is_(True))
    )
    plans = result.scalars().all()
    candidates = [
        _apply_adjustment(base_price, plan)
        for plan in plans
        if _plan_applies(plan, night, days_before_checkin, quantity)
    ]
    if not candidates:
        return base_price
    return min(candidates)
