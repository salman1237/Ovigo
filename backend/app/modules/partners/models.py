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
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
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
    OTHER = "other"


class DocumentStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class PartnerRoleApplication(Base):
    __tablename__ = "partner_role_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    partner_role: Mapped["PartnerRole"] = relationship(back_populates="documents")  # noqa: F821
