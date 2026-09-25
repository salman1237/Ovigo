import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundError
from app.modules.bookings.models import Booking, BookingItemType, BookingStatusHistory
from app.modules.bookings.schemas import BookingItemCreate
from app.modules.business_network.models import BusinessReferral, ReferralStatus
from app.modules.commissions.models import Commission, CommissionStatus
from app.modules.fraud.models import FraudFlag, FraudFlagStatus, FraudRuleType, FraudSeverity
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import NotificationType
from app.modules.partners.models import DocumentStatus, DocumentType, PartnerDocument
from app.modules.rentcar.models import Vehicle, VehicleStatus
from app.modules.stays.models import Property, RoomType
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerAccount, PartnerRole, SystemRole, User


async def _alert_admins(db: AsyncSession, flag: FraudFlag) -> None:
    result = await db.execute(select(User.id).where(User.system_role.in_([SystemRole.ADMIN, SystemRole.SUPER_ADMIN])))
    for admin_id in result.scalars().all():
        await notifications_service.notify(
            db,
            user_id=admin_id,
            type=NotificationType.FRAUD_ALERT,
            title=f"{flag.severity.value.capitalize()} risk fraud flag",
            message=flag.description,
            link=f"/admin/fraud?user_id={flag.user_id}",
        )


async def _flag(
    db: AsyncSession,
    user_id: uuid.UUID,
    rule_type: FraudRuleType,
    severity: FraudSeverity,
    score: int,
    description: str,
    context_id: uuid.UUID | None = None,
) -> FraudFlag | None:
    """Idempotent: a second call with the same (user_id, rule_type, context_id) is a
    no-op, so re-running a scan or a repeated event never creates duplicate flags for
    the same underlying evidence."""
    existing = await db.execute(
        select(FraudFlag.id).where(
            FraudFlag.user_id == user_id, FraudFlag.rule_type == rule_type, FraudFlag.context_id == context_id
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None

    flag = FraudFlag(
        user_id=user_id, rule_type=rule_type, severity=severity, score=score, description=description, context_id=context_id
    )
    db.add(flag)
    await db.flush()
    if severity in (FraudSeverity.HIGH, FraudSeverity.CRITICAL):
        await _alert_admins(db, flag)
    return flag


async def _owner_user_id_for_item(db: AsyncSession, item: BookingItemCreate) -> uuid.UUID | None:
    if item.item_type == BookingItemType.TOUR_DEPARTURE:
        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .join(Tour, Tour.local_expert_role_id == PartnerRole.id)
            .join(TourDeparture, TourDeparture.tour_id == Tour.id)
            .where(TourDeparture.id == item.tour_departure_id)
        )
        return result.scalar_one_or_none()
    if item.item_type == BookingItemType.ROOM_TYPE:
        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .join(Property, Property.host_role_id == PartnerRole.id)
            .join(RoomType, RoomType.property_id == Property.id)
            .where(RoomType.id == item.room_type_id)
        )
        return result.scalar_one_or_none()
    if item.item_type == BookingItemType.VEHICLE_RENTAL:
        result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .join(Vehicle, Vehicle.rent_a_car_role_id == PartnerRole.id)
            .where(Vehicle.id == item.vehicle_id)
        )
        return result.scalar_one_or_none()
    return None


async def check_self_booking(db: AsyncSession, buyer_user_id: uuid.UUID, item: BookingItemCreate) -> None:
    owner_user_id = await _owner_user_id_for_item(db, item)
    if owner_user_id is not None and owner_user_id == buyer_user_id:
        await _flag(
            db,
            buyer_user_id,
            FraudRuleType.SELF_BOOKING,
            FraudSeverity.MEDIUM,
            30,
            f"Booked their own {item.item_type.value} listing",
            context_id=item.tour_departure_id or item.room_type_id or item.vehicle_id,
        )


async def check_self_review(db: AsyncSession, reviewer_user_id: uuid.UUID, owner_user_id: uuid.UUID | None, review_id: uuid.UUID) -> None:
    if owner_user_id is not None and owner_user_id == reviewer_user_id:
        await _flag(
            db, reviewer_user_id, FraudRuleType.SELF_REVIEW, FraudSeverity.HIGH, 50,
            "Reviewed their own listing", context_id=review_id,
        )


async def check_self_referral(db: AsyncSession, referring_role_id: uuid.UUID, linked_role_id: uuid.UUID, referral_id: uuid.UUID) -> None:
    referring_result = await db.execute(
        select(PartnerAccount.user_id).join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id).where(PartnerRole.id == referring_role_id)
    )
    linked_result = await db.execute(
        select(PartnerAccount.user_id).join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id).where(PartnerRole.id == linked_role_id)
    )
    referring_user_id = referring_result.scalar_one_or_none()
    linked_user_id = linked_result.scalar_one_or_none()
    if referring_user_id is not None and referring_user_id == linked_user_id:
        await _flag(
            db, referring_user_id, FraudRuleType.SELF_REFERRAL, FraudSeverity.HIGH, 60,
            "Referred a business that turned out to be their own second partner account", context_id=referral_id,
        )


RAPID_CANCELLATION_WINDOW_DAYS = 7
RAPID_CANCELLATION_THRESHOLD = 3


async def check_rapid_cancellations(db: AsyncSession, user_id: uuid.UUID) -> None:
    """A resolved/dismissed flag for this rule won't re-fire for the same user (see
    fraud/models.py's dedup constraint) — an admin's call on a specific user is treated
    as final for this heuristic rather than re-alerting every time they cancel again."""
    # This session runs with autoflush=False (app.database), and the caller
    # (bookings/service.py::_release_and_cancel) adds this cancellation's
    # BookingStatusHistory row earlier in the same still-open transaction — flush so
    # the count query below actually sees it.
    await db.flush()
    since = datetime.now(timezone.utc) - timedelta(days=RAPID_CANCELLATION_WINDOW_DAYS)
    result = await db.execute(
        select(func.count(BookingStatusHistory.id))
        .join(Booking, Booking.id == BookingStatusHistory.booking_id)
        .where(
            Booking.user_id == user_id,
            BookingStatusHistory.to_status == "cancelled",
            BookingStatusHistory.created_at >= since,
        )
    )
    count = result.scalar_one()
    if count >= RAPID_CANCELLATION_THRESHOLD:
        await _flag(
            db, user_id, FraudRuleType.RAPID_CANCELLATION_PATTERN, FraudSeverity.LOW, 20,
            f"{count} bookings cancelled in the last {RAPID_CANCELLATION_WINDOW_DAYS} days",
        )


INSTANT_CANCELLATION_MINUTES = 5
INSTANT_CANCELLATION_THRESHOLD = 3


async def check_instant_cancellation_pattern(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Distinct from rapid_cancellation_pattern above: several cancellations *within
    minutes of booking* looks like deliberate inventory-blocking or a fake-booking
    probe, not a traveler genuinely changing their mind days later — the closest
    buildable proxy for the feedback doc's "fake bookings" (see module docstring)."""
    await db.flush()
    since = datetime.now(timezone.utc) - timedelta(days=RAPID_CANCELLATION_WINDOW_DAYS)
    result = await db.execute(
        select(Booking.created_at, BookingStatusHistory.created_at)
        .join(BookingStatusHistory, BookingStatusHistory.booking_id == Booking.id)
        .where(
            Booking.user_id == user_id,
            BookingStatusHistory.to_status == "cancelled",
            BookingStatusHistory.created_at >= since,
        )
    )
    instant_count = sum(
        1
        for booking_created_at, cancelled_at in result.all()
        if (cancelled_at - booking_created_at) <= timedelta(minutes=INSTANT_CANCELLATION_MINUTES)
    )
    if instant_count >= INSTANT_CANCELLATION_THRESHOLD:
        await _flag(
            db, user_id, FraudRuleType.INSTANT_CANCELLATION_PATTERN, FraudSeverity.MEDIUM, 30,
            f"{instant_count} bookings cancelled within {INSTANT_CANCELLATION_MINUTES} minutes of "
            f"creation in the last {RAPID_CANCELLATION_WINDOW_DAYS} days",
        )


SUDDEN_PRICE_CHANGE_THRESHOLD = Decimal("0.5")  # 50%


async def check_sudden_price_change(
    db: AsyncSession,
    listing_owner_role_id: uuid.UUID,
    old_price: Decimal | None,
    new_price: Decimal | None,
    context_id: uuid.UUID,
    label: str,
) -> None:
    """Called inline from tours/stays/rentcar's own update functions, which already
    have the pre-update row (and therefore old_price) in hand — no separate price
    history table needed just to catch a single suspicious edit."""
    if old_price is None or new_price is None or old_price == 0 or old_price == new_price:
        return
    change = abs(new_price - old_price) / old_price
    if change < SUDDEN_PRICE_CHANGE_THRESHOLD:
        return
    user_result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == listing_owner_role_id)
    )
    user_id = user_result.scalar_one_or_none()
    if user_id is None:
        return
    direction = "increased" if new_price > old_price else "decreased"
    await _flag(
        db, user_id, FraudRuleType.SUDDEN_PRICE_CHANGE, FraudSeverity.MEDIUM, 25,
        f"{label} price {direction} {change:.0%} in a single update ({old_price} -> {new_price})",
        context_id=context_id,
    )


async def check_duplicate_property(
    db: AsyncSession, host_role_id: uuid.UUID, property_id: uuid.UUID, name: str
) -> None:
    result = await db.execute(
        select(Property.id).where(
            func.lower(Property.name) == name.strip().lower(),
            Property.host_role_id != host_role_id,
            Property.id != property_id,
        )
    )
    if result.scalars().first() is None:
        return
    user_result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == host_role_id)
    )
    user_id = user_result.scalar_one_or_none()
    if user_id is not None:
        await _flag(
            db, user_id, FraudRuleType.DUPLICATE_PROPERTY_LISTING, FraudSeverity.MEDIUM, 30,
            f'A property named "{name}" already exists under a different host',
            context_id=property_id,
        )


REFERRAL_NETWORK_WINDOW_DAYS = 30
REFERRAL_NETWORK_THRESHOLD = 5


async def check_referral_network_volume(db: AsyncSession, referring_role_id: uuid.UUID) -> None:
    since = datetime.now(timezone.utc) - timedelta(days=REFERRAL_NETWORK_WINDOW_DAYS)
    result = await db.execute(
        select(func.count(BusinessReferral.id)).where(
            BusinessReferral.referring_expert_role_id == referring_role_id,
            BusinessReferral.status == ReferralStatus.APPROVED,
            BusinessReferral.created_at >= since,
        )
    )
    count = result.scalar_one()
    if count < REFERRAL_NETWORK_THRESHOLD:
        return
    user_result = await db.execute(
        select(PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
        .where(PartnerRole.id == referring_role_id)
    )
    user_id = user_result.scalar_one_or_none()
    if user_id is not None:
        await _flag(
            db, user_id, FraudRuleType.REFERRAL_NETWORK_VOLUME, FraudSeverity.MEDIUM, 25,
            f"{count} business referrals approved in the last {REFERRAL_NETWORK_WINDOW_DAYS} days",
        )


async def scan_expired_vehicle_documents(db: AsyncSession) -> int:
    """Cross-references a published Vehicle's owning role against that role's own
    VERIFIED vehicle_registration document (partners/models.py's PartnerDocument,
    expiry tracking added in Phase 8.3) — not reactable to one event, since the
    document can simply pass its expiry_date with no action from anyone."""
    result = await db.execute(
        select(Vehicle.id, PartnerAccount.user_id, PartnerDocument.expiry_date)
        .join(PartnerRole, PartnerRole.id == Vehicle.rent_a_car_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .join(PartnerDocument, PartnerDocument.partner_role_id == Vehicle.rent_a_car_role_id)
        .where(
            Vehicle.status == VehicleStatus.PUBLISHED,
            PartnerDocument.document_type == DocumentType.VEHICLE_REGISTRATION,
            PartnerDocument.status == DocumentStatus.VERIFIED,
            PartnerDocument.expiry_date.is_not(None),
            PartnerDocument.expiry_date < date.today(),
        )
    )
    new_count = 0
    for vehicle_id, user_id, expiry_date in result.all():
        flag = await _flag(
            db, user_id, FraudRuleType.EXPIRED_VEHICLE_DOCUMENT, FraudSeverity.MEDIUM, 25,
            f"Published vehicle's registration document expired on {expiry_date}",
            context_id=vehicle_id,
        )
        if flag is not None:
            new_count += 1
    await db.commit()
    return new_count


HIGH_REFUND_RATE_MIN_VOLUME = 4
HIGH_REFUND_RATE_THRESHOLD = Decimal("0.4")  # 40%


async def scan_high_refund_rate(db: AsyncSession) -> int:
    """A partner's commissions going CANCELLED (commissions/models.py: "the booking
    was refunded following a dispute") at an unusually high rate relative to their
    total volume — a ratio over the partner's whole history, not one event, so this
    stays a batch scan like the other cross-cutting rules."""
    result = await db.execute(
        select(
            Commission.partner_role_id,
            func.count(Commission.id),
            func.sum(case((Commission.status == CommissionStatus.CANCELLED, 1), else_=0)),
        )
        .where(Commission.status != CommissionStatus.PENDING)
        .group_by(Commission.partner_role_id)
    )
    new_count = 0
    for partner_role_id, total, cancelled in result.all():
        if total < HIGH_REFUND_RATE_MIN_VOLUME:
            continue
        rate = Decimal(cancelled) / Decimal(total)
        if rate < HIGH_REFUND_RATE_THRESHOLD:
            continue
        user_result = await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == partner_role_id)
        )
        user_id = user_result.scalar_one_or_none()
        if user_id is None:
            continue
        flag = await _flag(
            db, user_id, FraudRuleType.HIGH_REFUND_RATE, FraudSeverity.HIGH, 40,
            f"{cancelled} of {total} commissions were cancelled due to a refund ({rate:.0%})",
        )
        if flag is not None:
            new_count += 1
    await db.commit()
    return new_count


async def scan_duplicate_identity_documents(db: AsyncSession) -> int:
    """Cross-account comparison, not reactable to a single event — see module
    docstring. Loads every partner document's bytes into memory to hash; acceptable
    at this codebase's scale (partner verification docs, capped in size at upload,
    not a high-volume table) but would need a stored hash column instead of reading
    file_data if this table ever grows large."""
    result = await db.execute(
        select(PartnerDocument.id, PartnerDocument.file_data, PartnerAccount.user_id)
        .join(PartnerRole, PartnerRole.id == PartnerDocument.partner_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
    )
    by_hash: dict[str, list[tuple[uuid.UUID, uuid.UUID]]] = {}
    for doc_id, file_data, user_id in result.all():
        digest = hashlib.sha256(file_data).hexdigest()
        by_hash.setdefault(digest, []).append((doc_id, user_id))

    new_count = 0
    for rows in by_hash.values():
        distinct_users = {user_id for _, user_id in rows}
        if len(distinct_users) < 2:
            continue
        for doc_id, user_id in rows:
            flag = await _flag(
                db, user_id, FraudRuleType.DUPLICATE_IDENTITY_DOCUMENT, FraudSeverity.CRITICAL, 70,
                f"Uploaded an identity document byte-identical to one from {len(distinct_users) - 1} other account(s)",
                context_id=doc_id,
            )
            if flag is not None:
                new_count += 1
    await db.commit()
    return new_count


async def get_user_risk_score(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        select(func.coalesce(func.sum(FraudFlag.score), 0)).where(
            FraudFlag.user_id == user_id, FraudFlag.status == FraudFlagStatus.OPEN
        )
    )
    return result.scalar_one()


def _to_flag_dict(flag: FraudFlag) -> dict:
    return {
        "id": flag.id,
        "user_id": flag.user_id,
        "user_name": flag.user.full_name,
        "user_email": flag.user.email,
        "rule_type": flag.rule_type,
        "severity": flag.severity,
        "score": flag.score,
        "description": flag.description,
        "context_id": flag.context_id,
        "status": flag.status,
        "resolved_by_id": flag.resolved_by_id,
        "resolved_at": flag.resolved_at,
        "resolution_note": flag.resolution_note,
        "created_at": flag.created_at,
    }


async def get_user_flags(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(FraudFlag)
        .where(FraudFlag.user_id == user_id)
        .options(selectinload(FraudFlag.user))
        .order_by(FraudFlag.created_at.desc())
    )
    return [_to_flag_dict(f) for f in result.scalars().all()]


async def list_flags(db: AsyncSession, status: FraudFlagStatus | None) -> list[dict]:
    query = select(FraudFlag).options(selectinload(FraudFlag.user))
    if status is not None:
        query = query.where(FraudFlag.status == status)
    result = await db.execute(query.order_by(FraudFlag.created_at.desc()))
    return [_to_flag_dict(f) for f in result.scalars().all()]


async def _get_flag_or_404(db: AsyncSession, flag_id: uuid.UUID) -> FraudFlag:
    result = await db.execute(
        select(FraudFlag).where(FraudFlag.id == flag_id).options(selectinload(FraudFlag.user))
    )
    flag = result.scalar_one_or_none()
    if flag is None:
        raise NotFoundError("Fraud flag not found")
    return flag


async def resolve_flag(db: AsyncSession, admin: User, flag_id: uuid.UUID, status: FraudFlagStatus, note: str | None) -> dict:
    flag = await _get_flag_or_404(db, flag_id)
    flag.status = status
    flag.resolved_by_id = admin.id
    flag.resolved_at = datetime.now(timezone.utc)
    flag.resolution_note = note
    await db.commit()
    await db.refresh(flag, attribute_names=["user"])
    return _to_flag_dict(flag)
