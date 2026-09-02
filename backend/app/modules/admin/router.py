import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.csv_export import rows_to_csv
from app.core.exceptions import NotFoundError
from app.core.permissions import require_admin
from app.database import get_db
from app.modules.admin import reports, service
from app.modules.admin.models import AuditLog
from app.modules.admin.schemas import (
    AdminBookingRead,
    AdminPartnerRoleRead,
    AdminPaymentRead,
    AdminPropertyRead,
    AdminTourRead,
    AdminVehicleRead,
    AuditLogRead,
    BookingsSummaryRow,
    DisputeOverviewRow,
    FraudOverviewRow,
    PartnerApprovalFunnelRow,
    PartnerPerformanceRow,
    PlatformRevenueRow,
    ReferralOverviewRow,
    RejectRequest,
)
from app.modules.bookings.models import BookingStatus
from app.modules.partners.models import PartnerDocument
from app.modules.payments.models import PaymentStatus
from app.modules.rentcar.models import VehicleStatus
from app.modules.stays.models import PropertyStatus
from app.modules.tours.models import TourStatus
from app.modules.users.models import PartnerRoleStatus, User

router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/partners/roles", response_model=list[AdminPartnerRoleRead])
async def list_partner_roles(
    status: PartnerRoleStatus | None = None,
    db: AsyncSession = Depends(get_db),
):
    return await service.list_roles(db, status)


@router.post("/partners/roles/{role_id}/approve", response_model=AdminPartnerRoleRead)
async def approve_partner_role(
    role_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.approve_role(db, current_user, role_id)


@router.post("/partners/roles/{role_id}/reject", response_model=AdminPartnerRoleRead)
async def reject_partner_role(
    role_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.reject_role(db, current_user, role_id, payload.reason)


@router.get("/partners/documents/{document_id}/file")
async def download_document(document_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PartnerDocument).where(PartnerDocument.id == document_id))
    document = result.scalar_one_or_none()
    if document is None:
        raise NotFoundError("Document not found")
    return Response(content=document.file_data, media_type=document.content_type)


@router.post("/partners/documents/{document_id}/verify")
async def verify_document(
    document_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await service.verify_document(db, current_user, document_id)
    return {"message": "Document verified"}


@router.post("/partners/documents/{document_id}/reject")
async def reject_document(
    document_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await service.reject_document(db, current_user, document_id, payload.reason)
    return {"message": "Document rejected"}


@router.get("/audit-logs", response_model=list[AuditLogRead])
async def list_audit_logs(limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit))
    return list(result.scalars().all())


@router.get("/tours", response_model=list[AdminTourRead])
async def list_tours(status: TourStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await service.list_tours(db, status)


@router.post("/tours/{tour_id}/approve", response_model=AdminTourRead)
async def approve_tour(
    tour_id: uuid.UUID, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.approve_tour(db, current_user, tour_id)


@router.post("/tours/{tour_id}/reject", response_model=AdminTourRead)
async def reject_tour(
    tour_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.reject_tour(db, current_user, tour_id, payload.reason)


@router.get("/properties", response_model=list[AdminPropertyRead])
async def list_properties(status: PropertyStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await service.list_properties(db, status)


@router.post("/properties/{property_id}/approve", response_model=AdminPropertyRead)
async def approve_property(
    property_id: uuid.UUID, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.approve_property(db, current_user, property_id)


@router.post("/properties/{property_id}/reject", response_model=AdminPropertyRead)
async def reject_property(
    property_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.reject_property(db, current_user, property_id, payload.reason)


@router.get("/bookings", response_model=list[AdminBookingRead])
async def list_bookings(status: BookingStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await service.list_bookings(db, status)


@router.get("/payments", response_model=list[AdminPaymentRead])
async def list_payments(status: PaymentStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await service.list_payments(db, status)


@router.get("/vehicles", response_model=list[AdminVehicleRead])
async def list_vehicles(status: VehicleStatus | None = None, db: AsyncSession = Depends(get_db)):
    return await service.list_vehicles(db, status)


@router.post("/vehicles/{vehicle_id}/approve", response_model=AdminVehicleRead)
async def approve_vehicle(
    vehicle_id: uuid.UUID, current_user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    return await service.approve_vehicle(db, current_user, vehicle_id)


@router.post("/vehicles/{vehicle_id}/reject", response_model=AdminVehicleRead)
async def reject_vehicle(
    vehicle_id: uuid.UUID,
    payload: RejectRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await service.reject_vehicle(db, current_user, vehicle_id, payload.reason)


def _csv_or_json(rows: list[BaseModel], csv: bool, filename: str):
    if not csv:
        return rows
    return Response(
        content=rows_to_csv(rows), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'}
    )


@router.get("/reports/bookings-summary", response_model=list[BookingsSummaryRow])
async def get_bookings_summary_report(months: int = 12, csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.bookings_summary(db, months), csv, "bookings-summary")


@router.get("/reports/platform-revenue", response_model=list[PlatformRevenueRow])
async def get_platform_revenue_report(months: int = 12, csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.platform_revenue(db, months), csv, "platform-revenue")


@router.get("/reports/partner-performance", response_model=list[PartnerPerformanceRow])
async def get_partner_performance_report(limit: int = 20, csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.partner_performance(db, limit), csv, "partner-performance")


@router.get("/reports/fraud-overview", response_model=list[FraudOverviewRow])
async def get_fraud_overview_report(csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.fraud_overview(db), csv, "fraud-overview")


@router.get("/reports/dispute-overview", response_model=list[DisputeOverviewRow])
async def get_dispute_overview_report(csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.dispute_overview(db), csv, "dispute-overview")


@router.get("/reports/referral-overview", response_model=list[ReferralOverviewRow])
async def get_referral_overview_report(csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.referral_overview(db), csv, "referral-overview")


@router.get("/reports/partner-approval-funnel", response_model=list[PartnerApprovalFunnelRow])
async def get_partner_approval_funnel_report(csv: bool = False, db: AsyncSession = Depends(get_db)):
    return _csv_or_json(await reports.partner_approval_funnel(db), csv, "partner-approval-funnel")
