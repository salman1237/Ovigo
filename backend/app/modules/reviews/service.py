import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus
from app.modules.reviews.models import Review
from app.modules.reviews.schemas import ReviewCreate
from app.modules.tours.models import TourDeparture
from app.modules.users.models import User

_EAGER = (selectinload(Review.reviewer),)


async def create_review(db: AsyncSession, user: User, payload: ReviewCreate) -> Review:
    result = await db.execute(
        select(BookingItem)
        .join(Booking, BookingItem.booking_id == Booking.id)
        .where(BookingItem.id == payload.booking_item_id, Booking.user_id == user.id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise NotFoundError("Booking item not found")
    if item.status != BookingItemStatus.COMPLETED:
        raise ConflictError("You can only review a completed booking")

    existing = await db.execute(select(Review.id).where(Review.booking_item_id == item.id))
    if existing.scalar_one_or_none():
        raise ConflictError("You've already reviewed this booking")

    tour_id = None
    property_id = None
    if item.tour_departure_id:
        dep_result = await db.execute(select(TourDeparture.tour_id).where(TourDeparture.id == item.tour_departure_id))
        tour_id = dep_result.scalar_one_or_none()
    if item.room_type_id:
        from app.modules.stays.models import RoomType

        room_result = await db.execute(select(RoomType.property_id).where(RoomType.id == item.room_type_id))
        property_id = room_result.scalar_one_or_none()

    review = Review(
        booking_item_id=item.id,
        reviewer_id=user.id,
        tour_id=tour_id,
        property_id=property_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    await db.commit()

    result = await db.execute(select(Review).where(Review.id == review.id).options(*_EAGER))
    return result.scalar_one()


async def list_for_tour(db: AsyncSession, tour_id: uuid.UUID) -> list[Review]:
    result = await db.execute(
        select(Review).where(Review.tour_id == tour_id).options(*_EAGER).order_by(Review.created_at.desc())
    )
    return list(result.scalars().all())


async def list_for_property(db: AsyncSession, property_id: uuid.UUID) -> list[Review]:
    result = await db.execute(
        select(Review).where(Review.property_id == property_id).options(*_EAGER).order_by(Review.created_at.desc())
    )
    return list(result.scalars().all())
