"""Admin reports (technical document Sprint 21-22: "Advanced Admin reports, 20+
report types"). Scoped down to 7 curated reports built from data this codebase
already has — bookings, platform revenue, partner performance, fraud, disputes,
referrals, and partner-approval funnel — rather than fabricating 20+ superficial
reports with no real underlying signal. Each report is exposed as JSON (for the
admin dashboard table) and CSV (for export) from the same query, via
core/csv_export.py's `rows_to_csv`.

Phase 8.6 (client feedback's Analytics & KPI section) added 7 more of the same
shape, closing the remaining gaps against that section's own list: payout summary,
refund summary, guide performance, custom-bid conversion, ad performance, location
performance, and customer retention. Booking/revenue/commission/partner/dispute/
fraud performance were already covered above; expert/host/tour/property performance
already exist as *per-partner* dashboards (analytics/service.py) rather than
cross-partner admin reports, which is the more useful shape for that specific data
(a partner needs their own numbers, an admin needs the aggregate view) — not
duplicated here.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.schemas import (
    AdPerformanceRow,
    BookingsSummaryRow,
    CustomBidConversionRow,
    CustomerRetentionRow,
    DisputeOverviewRow,
    FraudOverviewRow,
    GuidePerformanceRow,
    LocationPerformanceRow,
    PartnerApprovalFunnelRow,
    PartnerPerformanceRow,
    PayoutSummaryRow,
    PlatformRevenueRow,
    RefundSummaryRow,
    ReferralOverviewRow,
)
from app.modules.ads.models import AdCampaign
from app.modules.bidding.models import BidStatus, CustomTourRequest, TourBid
from app.modules.bookings.models import Booking, BookingItem, BookingItemStatus, BookingItemType
from app.modules.business_network.models import BusinessReferral
from app.modules.commissions.models import Commission
from app.modules.disputes.models import Dispute
from app.modules.guides.models import AssignmentStatus, GuideAssignment
from app.modules.locations.models import Location, LocationTag, TaggableEntityType
from app.modules.payments.models import EscrowStatus, EscrowTransaction
from app.modules.payouts.models import Payout
from app.modules.stays.models import RoomType
from app.modules.tours.models import TourDeparture
from app.modules.fraud.models import FraudFlag, FraudFlagStatus
from app.modules.users.models import PartnerAccount, PartnerRole, User


async def bookings_summary(db: AsyncSession, months: int = 12) -> list[BookingsSummaryRow]:
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    period = func.to_char(Booking.created_at, "YYYY-MM")
    result = await db.execute(
        select(period.label("period"), Booking.status, func.count(Booking.id), func.sum(Booking.total_amount))
        .where(Booking.created_at >= since)
        .group_by(period, Booking.status)
        .order_by(period)
    )
    return [
        BookingsSummaryRow(period=r[0], status=r[1], booking_count=r[2], gross_revenue=r[3] or Decimal("0"))
        for r in result.all()
    ]


async def platform_revenue(db: AsyncSession, months: int = 12) -> list[PlatformRevenueRow]:
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    period = func.to_char(Commission.created_at, "YYYY-MM")
    result = await db.execute(
        select(
            period.label("period"),
            func.count(Commission.id),
            func.sum(Commission.commission_amount),
            func.sum(Commission.partner_net_amount),
        )
        .where(Commission.created_at >= since)
        .group_by(period)
        .order_by(period)
    )
    return [
        PlatformRevenueRow(
            period=r[0], commission_count=r[1], platform_revenue=r[2] or Decimal("0"), partner_net_revenue=r[3] or Decimal("0")
        )
        for r in result.all()
    ]


async def partner_performance(db: AsyncSession, limit: int = 20) -> list[PartnerPerformanceRow]:
    result = await db.execute(
        select(
            PartnerRole.id,
            User.full_name,
            PartnerRole.role_type,
            func.count(Commission.id),
            func.sum(Commission.gross_amount),
            func.sum(Commission.commission_amount),
        )
        .select_from(Commission)
        .join(PartnerRole, PartnerRole.id == Commission.partner_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .join(User, User.id == PartnerAccount.user_id)
        .group_by(PartnerRole.id, User.full_name, PartnerRole.role_type)
        .order_by(func.sum(Commission.gross_amount).desc())
        .limit(limit)
    )
    return [
        PartnerPerformanceRow(
            partner_role_id=r[0], partner_name=r[1], role_type=r[2],
            commission_count=r[3], gross_revenue=r[4] or Decimal("0"), platform_revenue=r[5] or Decimal("0"),
        )
        for r in result.all()
    ]


async def fraud_overview(db: AsyncSession) -> list[FraudOverviewRow]:
    result = await db.execute(
        select(FraudFlag.rule_type, FraudFlag.severity, FraudFlag.status, func.count(FraudFlag.id)).group_by(
            FraudFlag.rule_type, FraudFlag.severity, FraudFlag.status
        )
    )
    grouped: dict[tuple, dict[str, int]] = {}
    for rule_type, severity, status, count in result.all():
        key = (rule_type, severity)
        grouped.setdefault(key, {"open": 0, "resolved": 0, "dismissed": 0})[status.value] = count
    return [
        FraudOverviewRow(
            rule_type=rule_type.value, severity=severity.value,
            open_count=counts["open"], resolved_count=counts["resolved"], dismissed_count=counts["dismissed"],
        )
        for (rule_type, severity), counts in grouped.items()
    ]


async def dispute_overview(db: AsyncSession) -> list[DisputeOverviewRow]:
    result = await db.execute(
        select(Dispute.status, Dispute.resolution, func.count(Dispute.id)).group_by(Dispute.status, Dispute.resolution)
    )
    return [
        DisputeOverviewRow(status=status.value, resolution=resolution.value if resolution else None, dispute_count=count)
        for status, resolution, count in result.all()
    ]


async def referral_overview(db: AsyncSession) -> list[ReferralOverviewRow]:
    result = await db.execute(
        select(BusinessReferral.status, BusinessReferral.ownership_type, func.count(BusinessReferral.id)).group_by(
            BusinessReferral.status, BusinessReferral.ownership_type
        )
    )
    return [
        ReferralOverviewRow(status=status.value, ownership_type=ownership_type.value, referral_count=count)
        for status, ownership_type, count in result.all()
    ]


async def partner_approval_funnel(db: AsyncSession) -> list[PartnerApprovalFunnelRow]:
    result = await db.execute(
        select(PartnerRole.role_type, PartnerRole.status, func.count(PartnerRole.id)).group_by(
            PartnerRole.role_type, PartnerRole.status
        )
    )
    return [
        PartnerApprovalFunnelRow(role_type=role_type, status=status, role_count=count)
        for role_type, status, count in result.all()
    ]


async def payout_summary(db: AsyncSession, months: int = 12) -> list[PayoutSummaryRow]:
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    period = func.to_char(Payout.created_at, "YYYY-MM")
    result = await db.execute(
        select(period.label("period"), Payout.status, func.count(Payout.id), func.sum(Payout.total_amount))
        .where(Payout.created_at >= since)
        .group_by(period, Payout.status)
        .order_by(period)
    )
    return [
        PayoutSummaryRow(period=r[0], status=r[1].value, payout_count=r[2], total_amount=r[3] or Decimal("0"))
        for r in result.all()
    ]


async def refund_summary(db: AsyncSession, months: int = 12) -> list[RefundSummaryRow]:
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    period = func.to_char(EscrowTransaction.released_at, "YYYY-MM")
    result = await db.execute(
        select(period.label("period"), func.count(EscrowTransaction.id), func.sum(EscrowTransaction.amount))
        .where(EscrowTransaction.status == EscrowStatus.REFUNDED, EscrowTransaction.released_at >= since)
        .group_by(period)
        .order_by(period)
    )
    return [
        RefundSummaryRow(period=r[0], refund_count=r[1], total_refunded=r[2] or Decimal("0")) for r in result.all()
    ]


async def guide_performance(db: AsyncSession, limit: int = 20) -> list[GuidePerformanceRow]:
    result = await db.execute(
        select(PartnerRole.id, User.full_name, func.count(GuideAssignment.id), func.sum(GuideAssignment.fee_amount))
        .select_from(GuideAssignment)
        .join(PartnerRole, PartnerRole.id == GuideAssignment.guide_role_id)
        .join(PartnerAccount, PartnerAccount.id == PartnerRole.partner_account_id)
        .join(User, User.id == PartnerAccount.user_id)
        .where(GuideAssignment.status == AssignmentStatus.COMPLETED)
        .group_by(PartnerRole.id, User.full_name)
        .order_by(func.count(GuideAssignment.id).desc())
        .limit(limit)
    )
    return [
        GuidePerformanceRow(guide_role_id=r[0], guide_name=r[1], completed_assignments=r[2], total_fees=r[3] or Decimal("0"))
        for r in result.all()
    ]


async def custom_bid_conversion(db: AsyncSession, months: int = 12) -> list[CustomBidConversionRow]:
    """accepted_bids_count doubles as "resulting bookings" — accepting a bid
    immediately converts it to a real booking (bidding/service.py::accept_bid), so a
    separate booking count would just repeat this same number."""
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    req_period = func.to_char(CustomTourRequest.created_at, "YYYY-MM")
    req_result = await db.execute(
        select(req_period.label("period"), func.count(CustomTourRequest.id))
        .where(CustomTourRequest.created_at >= since)
        .group_by(req_period)
    )
    requests_by_period = dict(req_result.all())

    bid_period = func.to_char(TourBid.created_at, "YYYY-MM")
    bid_result = await db.execute(
        select(bid_period.label("period"), TourBid.status, func.count(TourBid.id))
        .where(TourBid.created_at >= since)
        .group_by(bid_period, TourBid.status)
    )
    bids_by_period: dict[str, int] = defaultdict(int)
    accepted_by_period: dict[str, int] = defaultdict(int)
    for period, status, count in bid_result.all():
        bids_by_period[period] += count
        if status == BidStatus.ACCEPTED:
            accepted_by_period[period] += count

    all_periods = sorted(set(requests_by_period) | set(bids_by_period))
    return [
        CustomBidConversionRow(
            period=p,
            requests_count=requests_by_period.get(p, 0),
            bids_count=bids_by_period.get(p, 0),
            accepted_bids_count=accepted_by_period.get(p, 0),
        )
        for p in all_periods
    ]


async def ad_performance(db: AsyncSession) -> list[AdPerformanceRow]:
    result = await db.execute(
        select(
            AdCampaign.status,
            func.count(AdCampaign.id),
            func.sum(AdCampaign.impressions_count),
            func.sum(AdCampaign.clicks_count),
            func.sum(AdCampaign.budget_spent),
        ).group_by(AdCampaign.status)
    )
    rows = []
    for status, count, impressions, clicks, spend in result.all():
        impressions = impressions or 0
        clicks = clicks or 0
        rows.append(
            AdPerformanceRow(
                status=status.value,
                campaign_count=count,
                total_impressions=impressions,
                total_clicks=clicks,
                total_spend=spend or Decimal("0"),
                click_through_rate=round(clicks / impressions, 4) if impressions else 0.0,
            )
        )
    return rows


async def location_performance(db: AsyncSession, limit: int = 20) -> list[LocationPerformanceRow]:
    """Traces each non-cancelled BookingItem back to its listing's location tags —
    a 3-way union since a booking item can be a tour departure, a room type, or a
    vehicle rental, each reaching Location via a different chain of joins."""
    tour_q = (
        select(LocationTag.location_id, BookingItem.id.label("item_id"), BookingItem.subtotal)
        .select_from(BookingItem)
        .join(TourDeparture, TourDeparture.id == BookingItem.tour_departure_id)
        .join(
            LocationTag,
            (LocationTag.entity_type == TaggableEntityType.TOUR) & (LocationTag.entity_id == TourDeparture.tour_id),
        )
        .where(BookingItem.item_type == BookingItemType.TOUR_DEPARTURE, BookingItem.status != BookingItemStatus.CANCELLED)
    )
    property_q = (
        select(LocationTag.location_id, BookingItem.id.label("item_id"), BookingItem.subtotal)
        .select_from(BookingItem)
        .join(RoomType, RoomType.id == BookingItem.room_type_id)
        .join(
            LocationTag,
            (LocationTag.entity_type == TaggableEntityType.PROPERTY) & (LocationTag.entity_id == RoomType.property_id),
        )
        .where(BookingItem.item_type == BookingItemType.ROOM_TYPE, BookingItem.status != BookingItemStatus.CANCELLED)
    )
    vehicle_q = (
        select(LocationTag.location_id, BookingItem.id.label("item_id"), BookingItem.subtotal)
        .select_from(BookingItem)
        .join(
            LocationTag,
            (LocationTag.entity_type == TaggableEntityType.VEHICLE) & (LocationTag.entity_id == BookingItem.vehicle_id),
        )
        .where(BookingItem.item_type == BookingItemType.VEHICLE_RENTAL, BookingItem.status != BookingItemStatus.CANCELLED)
    )
    union_q = tour_q.union_all(property_q, vehicle_q).subquery()
    result = await db.execute(
        select(Location.id, Location.name, func.count(union_q.c.item_id), func.sum(union_q.c.subtotal))
        .join(union_q, union_q.c.location_id == Location.id)
        .group_by(Location.id, Location.name)
        .order_by(func.sum(union_q.c.subtotal).desc())
        .limit(limit)
    )
    return [
        LocationPerformanceRow(location_id=r[0], location_name=r[1], booking_count=r[2], gross_revenue=r[3] or Decimal("0"))
        for r in result.all()
    ]


async def customer_retention(db: AsyncSession, months: int = 12) -> list[CustomerRetentionRow]:
    """Computed in Python rather than SQL: needs each user's true first-ever booking
    period (not just within the reporting window) to correctly classify "new" vs
    "returning" at the start of that window, and this codebase's booking volume is
    small enough that fetching every booking once is simpler than an equivalent
    correlated-subquery approach — same call this module makes elsewhere (e.g.
    fraud/service.py's document-hash scan) when a query would be harder to read than
    the data is large."""
    since = datetime.now(timezone.utc) - timedelta(days=months * 31)
    result = await db.execute(select(Booking.user_id, Booking.created_at).order_by(Booking.created_at))

    first_period_by_user: dict[uuid.UUID, str] = {}
    active_users_by_period: dict[str, set[uuid.UUID]] = defaultdict(set)
    for user_id, created_at in result.all():
        period = created_at.strftime("%Y-%m")
        first_period_by_user.setdefault(user_id, period)
        if created_at >= since:
            active_users_by_period[period].add(user_id)

    rows = []
    for period in sorted(active_users_by_period):
        users = active_users_by_period[period]
        new_count = sum(1 for u in users if first_period_by_user[u] == period)
        rows.append(CustomerRetentionRow(period=period, new_customers=new_count, returning_customers=len(users) - new_count))
    return rows
