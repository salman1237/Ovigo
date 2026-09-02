import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus
from app.modules.fraud import service as fraud_service
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.reviews.models import Review
from app.modules.reviews.schemas import ReviewCreate
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerAccount, PartnerRole, User

_EAGER = (selectinload(Review.reviewer),)


async def _user_id_for_partner_role(db: AsyncSession, partner_role_id: uuid.UUID) -> uuid.UUID | None:
    result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == partner_role_id)
    )
    return result.scalar_one_or_none()


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
    recipient_user_id = None
    if item.tour_departure_id:
        dep_result = await db.execute(
            select(TourDeparture.tour_id, Tour.local_expert_role_id, Tour.title)
            .join(Tour, Tour.id == TourDeparture.tour_id)
            .where(TourDeparture.id == item.tour_departure_id)
        )
        row = dep_result.one_or_none()
        if row:
            tour_id, local_expert_role_id, listing_title = row
            recipient_user_id = await _user_id_for_partner_role(db, local_expert_role_id)
    if item.room_type_id:
        from app.modules.stays.models import Property, RoomType

        room_result = await db.execute(
            select(RoomType.property_id, Property.host_role_id, Property.name)
            .join(Property, Property.id == RoomType.property_id)
            .where(RoomType.id == item.room_type_id)
        )
        row = room_result.one_or_none()
        if row:
            property_id, host_role_id, listing_title = row
            recipient_user_id = await _user_id_for_partner_role(db, host_role_id)

    review = Review(
        booking_item_id=item.id,
        reviewer_id=user.id,
        tour_id=tour_id,
        property_id=property_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)

    if recipient_user_id:
        await notifications_service.notify(
            db,
            user_id=recipient_user_id,
            type=NotificationType.NEW_REVIEW,
            title="New review received",
            message=f'{user.full_name} left a {payload.rating}-star review on "{listing_title}".',
        )

    await db.commit()
    await fraud_service.check_self_review(db, user.id, recipient_user_id, review.id)
    await db.commit()

    if tour_id is not None:
        from app.modules.badges import service as badges_service
        from app.modules.locations.models import TaggableEntityType

        await badges_service.recompute_top_rated(db, TaggableEntityType.TOUR, tour_id)
    if property_id is not None:
        from app.modules.badges import service as badges_service
        from app.modules.locations.models import TaggableEntityType

        await badges_service.recompute_top_rated(db, TaggableEntityType.PROPERTY, property_id)

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
