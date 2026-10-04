"""Computed Local Expert track record (PRD §8.2): rating and breakdown, completed
bookings, successful tours, completion / cancellation / response rates and
average response time — all derived from real bookings, reviews and chats.

These replace the `LocalExpertProfile` columns of the same names, which were
never maintained and default to flattering placeholders (5.00 rating, 100%
response). A metric with nothing to measure yet is None ("new"), never a guess.

An expert's bookings are the tour-departure items of their tours plus the
custom-bid items of their accepted bids. Rates only count bookings that were
paid (reached CONFIRMED): an abandoned checkout says nothing about the expert.
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bidding.models import TourBid
from app.modules.bookings.models import BookingItem, BookingItemStatus, BookingStatus, BookingStatusHistory
from app.modules.chat.models import ChatMessage, ChatThread
from app.modules.partners.models import DocumentStatus, DocumentType, PartnerDocument
from app.modules.reviews.models import Review
from app.modules.tours.models import Tour, TourDeparture
from app.modules.users.models import PartnerAccount, PartnerRole

RESPONSE_WINDOW_DAYS = 365
RESPONSE_THREAD_LIMIT = 500


@dataclass
class ExpertStats:
    rating_avg: Decimal | None = None
    reviews_count: int = 0
    rating_breakdown: dict[int, int] = field(default_factory=lambda: {s: 0 for s in (5, 4, 3, 2, 1)})
    completed_bookings: int = 0
    successful_tours: int = 0
    completion_rate_percent: int | None = None
    cancellation_rate_percent: int | None = None
    response_rate_percent: int | None = None
    avg_response_minutes: int | None = None


def expert_items_condition(expert_role_id: uuid.UUID):
    """SQL condition: this BookingItem is one of the expert's (a departure of their
    tour, or their accepted custom-tour bid)."""
    departures = (
        select(TourDeparture.id)
        .join(Tour, Tour.id == TourDeparture.tour_id)
        .where(Tour.local_expert_role_id == expert_role_id)
    )
    bids = select(TourBid.id).where(TourBid.local_expert_role_id == expert_role_id)
    return or_(BookingItem.tour_departure_id.in_(departures), BookingItem.custom_bid_id.in_(bids))


def _percent(part: int, whole: int) -> int | None:
    return round(part * 100 / whole) if whole else None


async def _rating(db: AsyncSession, expert_role_id: uuid.UUID, stats: ExpertStats) -> None:
    rows = await db.execute(
        select(Review.rating, func.count())
        .join(BookingItem, BookingItem.id == Review.booking_item_id)
        .where(expert_items_condition(expert_role_id))
        .group_by(Review.rating)
    )
    total = weighted = 0
    for rating, count in rows.all():
        if rating in stats.rating_breakdown:
            stats.rating_breakdown[rating] = count
        total += count
        weighted += rating * count
    stats.reviews_count = total
    if total:
        stats.rating_avg = (Decimal(weighted) / Decimal(total)).quantize(Decimal("0.01"))


async def _bookings(db: AsyncSession, expert_role_id: uuid.UUID, stats: ExpertStats) -> None:
    was_confirmed = exists().where(
        BookingStatusHistory.booking_id == BookingItem.booking_id,
        BookingStatusHistory.to_status == BookingStatus.CONFIRMED.value,
    )
    rows = (
        await db.execute(
            select(BookingItem.status, BookingItem.booking_id, BookingItem.tour_departure_id, BookingItem.custom_bid_id)
            .where(expert_items_condition(expert_role_id), was_confirmed)
        )
    ).all()
    completed = [r for r in rows if r.status == BookingItemStatus.COMPLETED]
    cancelled = sum(1 for r in rows if r.status == BookingItemStatus.CANCELLED)
    stats.completed_bookings = len({r.booking_id for r in completed})
    stats.successful_tours = len({r.tour_departure_id for r in completed if r.tour_departure_id}) + len(
        {r.custom_bid_id for r in completed if r.custom_bid_id}
    )
    stats.completion_rate_percent = _percent(len(completed), len(completed) + cancelled)
    stats.cancellation_rate_percent = _percent(cancelled, len(rows))


async def _responsiveness(db: AsyncSession, expert_role_id: uuid.UUID, stats: ExpertStats) -> None:
    """Of the conversations travelers started with the expert in the last year, the
    share the expert answered, and how long the first answer took on average."""
    expert_user_id = (
        await db.execute(
            select(PartnerAccount.user_id)
            .join(PartnerRole, PartnerRole.partner_account_id == PartnerAccount.id)
            .where(PartnerRole.id == expert_role_id)
        )
    ).scalar_one_or_none()
    if expert_user_id is None:
        return
    since = datetime.now(timezone.utc) - timedelta(days=RESPONSE_WINDOW_DAYS)
    threads = dict(
        (
            await db.execute(
                select(ChatThread.id, ChatThread.traveler_id)
                .where(ChatThread.partner_role_id == expert_role_id, ChatThread.created_at >= since)
                .order_by(ChatThread.created_at.desc())
                .limit(RESPONSE_THREAD_LIMIT)
            )
        ).all()
    )
    if not threads:
        return
    messages: dict[uuid.UUID, list[tuple[datetime, uuid.UUID]]] = defaultdict(list)
    for thread_id, sender_id, created_at in (
        await db.execute(
            select(ChatMessage.thread_id, ChatMessage.sender_id, ChatMessage.created_at)
            .where(ChatMessage.thread_id.in_(threads.keys()))
            .order_by(ChatMessage.created_at)
        )
    ).all():
        messages[thread_id].append((created_at, sender_id))

    asked = answered = 0
    delays: list[float] = []
    for thread_id, traveler_id in threads.items():
        first_question = next((at for at, sender in messages[thread_id] if sender == traveler_id), None)
        if first_question is None:
            continue
        asked += 1
        reply = next((at for at, sender in messages[thread_id] if sender == expert_user_id and at >= first_question), None)
        if reply is not None:
            answered += 1
            delays.append((reply - first_question).total_seconds() / 60)
    stats.response_rate_percent = _percent(answered, asked)
    if delays:
        stats.avg_response_minutes = max(1, round(sum(delays) / len(delays)))


async def expert_stats(db: AsyncSession, expert_role_id: uuid.UUID) -> ExpertStats:
    stats = ExpertStats()
    await _rating(db, expert_role_id, stats)
    await _bookings(db, expert_role_id, stats)
    await _responsiveness(db, expert_role_id, stats)
    return stats


async def identity_verified(db: AsyncSession, role_id: uuid.UUID) -> bool:
    """Ovigo has verified a national ID / passport document for this partner role."""
    found = await db.execute(
        select(PartnerDocument.id)
        .where(
            and_(
                PartnerDocument.partner_role_id == role_id,
                PartnerDocument.document_type == DocumentType.ID_CARD,
                PartnerDocument.status == DocumentStatus.VERIFIED,
            )
        )
        .limit(1)
    )
    return found.scalar_one_or_none() is not None

