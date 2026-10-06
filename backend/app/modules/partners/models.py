"""Partner role application review trail and verification documents.

`PartnerRole` (in app.modules.users.models) holds the *current* state of a role.
`PartnerRoleApplication` is the append-only history of submissions/decisions on top
of it — one row per apply/approve/reject cycle, so re-applying after a rejection
doesn't lose the audit trail.

Document storage: file bytes are stored in Postgres (`LargeBinary`) rather than
object storage for now — there's no S3/R2 configured yet, and FastAPI Cloud's
container filesystem is ephemeral (wiped on every redeploy), so local disk isn't an
option either. Small ID/license-photo uploads are fine in Postgres for the MVP;
migrating to signed URLs via Cloudflare R2 (per the technical document §3.1) is
tracked as a follow-up once that credential exists.
"""
import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class DocumentType(str, enum.Enum):
    ID_CARD = "id_card"
    TRADE_LICENSE = "trade_license"
    PROPERTY_DEED = "property_deed"
    VEHICLE_REGISTRATION = "vehicle_registration"
    UTILITY_BILL = "utility_bill"
    FITNESS_CERTIFICATE = "fitness_certificate"
    INSURANCE = "insurance"
    DRIVER_LICENSE = "driver_license"
    POLICE_CLEARANCE = "police_clearance"
    FIRST_AID_CERTIFICATE = "first_aid_certificate"
    OTHER = "other"


class NationalIdType(str, enum.Enum):
    ID_CARD = "id_card"
    PASSPORT = "passport"


class PayoutMethod(str, enum.Enum):
    BANK = "bank"
    MOBILE_FINANCIAL_SERVICE = "mobile_financial_service"


class DocumentStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


# PRD §7 (Partner Verification and Onboarding) ties each role to a specific set of
# documents beyond the common ID requirement — this is the enforcement point that
# was previously missing: nothing stopped a role from reaching APPROVED with zero
# documents attached. Keyed by the PartnerRoleType string value (not the enum
# itself) to avoid a circular import with app.modules.users.models.
REQUIRED_DOCUMENT_TYPES: dict[str, list[DocumentType]] = {
    "local_expert": [DocumentType.ID_CARD],
    "guide": [DocumentType.ID_CARD],
    "host": [DocumentType.ID_CARD, DocumentType.PROPERTY_DEED, DocumentType.UTILITY_BILL],
    "hotel": [
        DocumentType.ID_CARD,
        DocumentType.PROPERTY_DEED,
        DocumentType.UTILITY_BILL,
        DocumentType.TRADE_LICENSE,
    ],
    "rent_a_car": [
        DocumentType.ID_CARD,
        DocumentType.TRADE_LICENSE,
        DocumentType.VEHICLE_REGISTRATION,
        DocumentType.FITNESS_CERTIFICATE,
        DocumentType.INSURANCE,
        DocumentType.DRIVER_LICENSE,
    ],
}

# Offered but not required — surfaced to the frontend wizard's Documents step as
# optional uploads (PRD §7.2/§7.4 call these out explicitly as "optional").
OPTIONAL_DOCUMENT_TYPES: dict[str, list[DocumentType]] = {
    "local_expert": [DocumentType.POLICE_CLEARANCE, DocumentType.FIRST_AID_CERTIFICATE, DocumentType.OTHER],
    "guide": [DocumentType.FIRST_AID_CERTIFICATE, DocumentType.OTHER],
    "host": [],
    "hotel": [],
    "rent_a_car": [],
}


def missing_required_documents(role_type: str, documents: list["PartnerDocument"]) -> list[DocumentType]:
    """Required document types for `role_type` that have no uploaded document of that type yet."""
    required = REQUIRED_DOCUMENT_TYPES.get(role_type, [])
    present = {d.document_type for d in documents}
    return [dt for dt in required if dt not in present]


class PartnerRoleApplication(Base):
    __tablename__ = "partner_role_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # PRD §7.1 common verification fields — nullable at the DB level so existing rows
    # (and the admin-created/legacy paths) don't break, but required() in service.py's
    # apply_for_role enforces these before a new application can be submitted.
    full_legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_mobile_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    national_id_type: Mapped[NationalIdType | None] = mapped_column(
        Enum(NationalIdType, name="national_id_type"), nullable=True
    )
    national_id_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    permanent_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payout_method: Mapped[PayoutMethod | None] = mapped_column(
        Enum(PayoutMethod, name="payout_method"), nullable=True
    )
    payout_provider_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payout_account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payout_account_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agreed_to_partner_terms: Mapped[bool] = mapped_column(Boolean, default=False)
    agreed_to_background_check: Mapped[bool] = mapped_column(Boolean, default=False)

    # PRD §7.2-§7.5 role-specific fields, validated server-side against the matching
    # model in ROLE_DETAILS_SCHEMA (partners/schemas.py) — see that map's docstring.
    role_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(ApplicationStatus, name="application_status"), default=ApplicationStatus.PENDING
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship(back_populates="applications")  # noqa: F821


class PartnerDocument(Base):
    __tablename__ = "partner_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    document_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType, name="document_type"))
    file_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    file_data: Mapped[bytes] = mapped_column(LargeBinary)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"), default=DocumentStatus.PENDING
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Self-reported at upload time (the partner knows their own document's expiry —
    # e.g. a trade license or vehicle registration renewal date; a national ID
    # typically has none, hence nullable). Verified/re-verified is a lazy check
    # against today's date wherever this is read (see admin/service.py's
    # list_expiring_documents) rather than a stored/cron-flipped status, matching
    # the same effective/expiry-date pattern CommissionRule already uses.
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship(back_populates="documents")  # noqa: F821
