import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.bookings.models import BookingStatus
from app.modules.partners.models import DocumentType
from app.modules.partners.schemas import PartnerDocumentRead, PartnerRoleApplicationRead
from app.modules.payments.models import EscrowStatus, PaymentProvider, PaymentStatus
from app.modules.rentcar.models import VehicleStatus
from app.modules.stays.models import PropertyStatus
from app.modules.stays.schemas import PropertyRead
from app.modules.tours.models import TourStatus
from app.modules.tours.schemas import TourRead
from app.modules.users.models import AdminPermissionRole, PartnerRoleStatus, PartnerRoleType, SystemRole


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str | None
    phone: str | None
    is_active: bool = True


class SuspendRequest(BaseModel):
    reason: str


class AdminAccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str | None
    phone: str | None
    system_role: SystemRole
    admin_permission_role: AdminPermissionRole | None
    admin_permissions: list[str] | None = None
    is_active: bool


class SetAdminPermissionRoleRequest(BaseModel):
    system_role: SystemRole | None = None
    admin_permission_role: AdminPermissionRole | None = None
    admin_permissions: list[str] | None = None


class AdminPartnerRoleRead(BaseModel):
    """A partner role as seen by admins reviewing applications — includes the
    applicant's identity, which the partner-facing schema deliberately omits."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role_type: PartnerRoleType
    status: PartnerRoleStatus
    approved_at: datetime | None
    created_at: datetime
    documents: list[PartnerDocumentRead] = []
    applicant: AdminUserSummary
    profile_details: dict | None = None
    applications: list[PartnerRoleApplicationRead] = []


class RejectRequest(BaseModel):
    reason: str


class AdminExpiringDocumentRead(BaseModel):
    id: uuid.UUID
    document_type: DocumentType
    expiry_date: date
    partner_role_id: uuid.UUID
    role_type: PartnerRoleType
    applicant: AdminUserSummary


class AdminTourRead(TourRead):
    """A tour as seen in the moderation queue — the full public read schema (pricing, pickup,
    safety, every policy field, and all nested collections) plus admin-only review fields."""

    has_high_risk_activities: bool = False
    expert_is_trusted: bool = False
    applicant: AdminUserSummary
    expert_documents: list[PartnerDocumentRead] = []


class ApproveTourRequest(BaseModel):
    # Required True for tours with high-risk activities — forces the admin to
    # explicitly confirm the safety checklist (insurance, permits, guide level).
    safety_checklist_confirmed: bool = False


class AdminPropertyRead(PropertyRead):
    """A property as seen in the moderation queue — the full public read schema (policies,
    room_types, amenities, images) plus the submitting host's identity."""

    applicant: AdminUserSummary


class AdminVehicleRead(BaseModel):
    """A vehicle as seen in the moderation queue — includes full specs and fleet documents."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    rent_a_car_role_id: uuid.UUID
    make: str
    model: str
    year: int
    vehicle_type: str | None = None
    transmission: str | None = None
    seats: int = 4
    price_per_day: Decimal = Decimal("0")
    with_driver: bool = False
    assigned_driver_id: uuid.UUID | None = None
    description: str | None = None
    status: VehicleStatus
    rejection_reason: str | None
    created_at: datetime
    applicant: AdminUserSummary
    vehicle_documents: list[PartnerDocumentRead] = []


class AdminBookingRead(BaseModel):
    """A booking as seen in the admin overview — traveler identity plus enough
    summary detail to triage without opening every booking."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: BookingStatus
    total_amount: Decimal
    currency: str
    created_at: datetime
    traveler: AdminUserSummary
    item_count: int


class AdminPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    booking_id: uuid.UUID
    provider: PaymentProvider
    tran_id: str
    val_id: str | None
    amount: Decimal
    currency: str
    status: PaymentStatus
    created_at: datetime


class AdminEscrowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_id: uuid.UUID
    amount: Decimal
    status: EscrowStatus
    held_at: datetime
    released_at: datetime | None


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    extra: dict | None
    created_at: datetime


class BookingsSummaryRow(BaseModel):
    period: str  # "YYYY-MM"
    status: BookingStatus
    booking_count: int
    gross_revenue: Decimal


class PlatformRevenueRow(BaseModel):
    period: str  # "YYYY-MM"
    commission_count: int
    platform_revenue: Decimal  # sum of Commission.commission_amount — Ovigo's cut
    partner_net_revenue: Decimal  # sum of Commission.partner_net_amount


class PartnerPerformanceRow(BaseModel):
    partner_role_id: uuid.UUID
    partner_name: str
    role_type: PartnerRoleType
    commission_count: int
    gross_revenue: Decimal
    platform_revenue: Decimal


class FraudOverviewRow(BaseModel):
    rule_type: str
    severity: str
    open_count: int
    resolved_count: int
    dismissed_count: int


class DisputeOverviewRow(BaseModel):
    status: str
    resolution: str | None
    dispute_count: int


class ReferralOverviewRow(BaseModel):
    status: str
    ownership_type: str
    referral_count: int


class AcquisitionChannelRow(BaseModel):
    channel: str  # organic / expert / advertising / unknown (booked before tracking)
    acquired_by: str | None  # the referring expert's or the ad campaign's name
    booking_count: int
    revenue: Decimal


class PartnerApprovalFunnelRow(BaseModel):
    role_type: PartnerRoleType
    status: PartnerRoleStatus
    role_count: int


class PayoutSummaryRow(BaseModel):
    period: str
    status: str
    payout_count: int
    total_amount: Decimal


class RefundSummaryRow(BaseModel):
    period: str
    refund_count: int
    total_refunded: Decimal


class GuidePerformanceRow(BaseModel):
    guide_role_id: uuid.UUID
    guide_name: str
    completed_assignments: int
    total_fees: Decimal


class CustomBidConversionRow(BaseModel):
    period: str
    requests_count: int
    bids_count: int
    accepted_bids_count: int


class AdPerformanceRow(BaseModel):
    status: str
    campaign_count: int
    total_impressions: int
    total_clicks: int
    total_spend: Decimal
    click_through_rate: float


class LocationPerformanceRow(BaseModel):
    location_id: uuid.UUID
    location_name: str
    booking_count: int
    gross_revenue: Decimal


class CustomerRetentionRow(BaseModel):
    period: str
    new_customers: int
    returning_customers: int
