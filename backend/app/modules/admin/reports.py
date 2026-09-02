"""Admin reports (technical document Sprint 21-22: "Advanced Admin reports, 20+
report types"). Scoped down to 7 curated reports built from data this codebase
already has — bookings, platform revenue, partner performance, fraud, disputes,
referrals, and partner-approval funnel — rather than fabricating 20+ superficial
reports with no real underlying signal. Each report is exposed as JSON (for the
admin dashboard table) and CSV (for export) from the same query, via
core/csv_export.py's `rows_to_csv`.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.schemas import (
    BookingsSummaryRow,
    DisputeOverviewRow,
    FraudOverviewRow,
    PartnerApprovalFunnelRow,
    PartnerPerformanceRow,
    PlatformRevenueRow,
    ReferralOverviewRow,
)
from app.modules.bookings.models import Booking
from app.modules.business_network.models import BusinessReferral
from app.modules.commissions.models import Commission
from app.modules.disputes.models import Dispute
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
