"""User, partner account and partner role ORM models.

Schema scope for Sprint 1-2 (Foundation): base tables only. Verification-document upload,
role-application workflow and public profile tables (local_expert_profiles, host_profiles, ...)
land in Sprint 3-4+ per the technical document's phase plan.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SystemRole(str, enum.Enum):
    """Coarse-grained account role. Independent of partner roles (Expert/Host/etc.)."""

    TRAVELER = "traveler"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class PartnerAccountStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class PartnerRoleType(str, enum.Enum):
    LOCAL_EXPERT = "local_expert"
    HOST = "host"
    GUIDE = "guide"
    HOTEL = "hotel"
    RENT_A_CAR = "rent_a_car"


class PartnerRoleStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))

    system_role: Mapped[SystemRole] = mapped_column(
        Enum(SystemRole, name="system_role"), default=SystemRole.TRAVELER, nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Dev-friendly OTP storage. Revisit with a dedicated `otp_codes` table + rate limiting
    # once real SMS/email providers are wired up (Phase 1 Sprint 9 / Phase 3 notifications).
    otp_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    partner_account: Mapped["PartnerAccount | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class PartnerAccount(TimestampMixin, Base):
    """One per user who has ever applied for at least one partner role."""

    __tablename__ = "partner_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    status: Mapped[PartnerAccountStatus] = mapped_column(
        Enum(PartnerAccountStatus, name="partner_account_status"), default=PartnerAccountStatus.PENDING
    )

    user: Mapped["User"] = relationship(back_populates="partner_account")
    roles: Mapped[list["PartnerRole"]] = relationship(back_populates="partner_account", cascade="all, delete-orphan")


class PartnerRole(TimestampMixin, Base):
    """A single role (Expert/Host/Guide/Hotel/Rent-a-Car) held by a partner account."""

    __tablename__ = "partner_roles"
    __table_args__ = (UniqueConstraint("partner_account_id", "role_type", name="uq_partner_role"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    partner_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_accounts.id", ondelete="CASCADE")
    )
    role_type: Mapped[PartnerRoleType] = mapped_column(Enum(PartnerRoleType, name="partner_role_type"))
    status: Mapped[PartnerRoleStatus] = mapped_column(
        Enum(PartnerRoleStatus, name="partner_role_status"), default=PartnerRoleStatus.PENDING
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    partner_account: Mapped["PartnerAccount"] = relationship(back_populates="roles")
    applications: Mapped[list["PartnerRoleApplication"]] = relationship(  # noqa: F821
        back_populates="partner_role",
        order_by="PartnerRoleApplication.created_at.desc()",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list["PartnerDocument"]] = relationship(  # noqa: F821
        back_populates="partner_role",
        order_by="PartnerDocument.created_at.desc()",
        cascade="all, delete-orphan",
    )
