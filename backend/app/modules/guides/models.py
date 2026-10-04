"""Guide supervision (technical document Phase 2, Sprint 12-13): a Guide never
operates independently on Ovigo — every Guide's `PartnerRole` (already a generic
role type since Sprint 1-2) is supervised by exactly one approved Local Expert,
who invites them, assigns them to specific tour departures, and vouches for
them. Guide registration & verification themselves reuse the existing generic
partner-role admin approval flow (`/api/v1/admin/partners/roles`) — nothing
guide-specific was needed there since `PartnerRole` was always role-type-generic.

What's new here is the supervision relationship and the assignment/availability/
check-in workflow the technical document's Guide dashboard calls for.

Phase 9.3 (PRD §10.8–10.9) turns guides into a real earning channel, two ways:

- **Hired by an expert, paid through Ovigo.** An assignment carries the fee the
  expert agreed to (one of the guide's own `GuideServicePackage` prices, or a
  custom amount). When the guide completes it, commissions/service.py writes
  ledger rows: the guide's GUIDE_FEE (fee minus Ovigo's commission), the
  assigning expert's GUIDE_FEE_DEDUCTION (minus the whole fee, netted against
  their earnings), and the onboarding expert's 2% NETWORK cut. They become
  payable once the departure's tour bookings complete, and are held while any of
  them is disputed.
- **Booked directly by a traveler.** A guide with an admin-approved
  `GuideProfile` sells their packages publicly (a GUIDE_SERVICE booking item for
  one date). Commission works like every other listing.

A guide can work with several experts at once: supervision is unique per
(guide, expert) pair, not per guide. A guide is never booked or assigned twice
for the same date (guides/service.py::assert_guide_free).
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SupervisionStatus(str, enum.Enum):
    PENDING = "pending"  # invited, awaiting the guide's response
    ACCEPTED = "accepted"
    REJECTED = "rejected"  # the invited guide declined
    TERMINATED = "terminated"  # ended by either party after being active


class AssignmentStatus(str, enum.Enum):
    ASSIGNED = "assigned"
    CHECKED_IN = "checked_in"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class GuideCertificationLevel(str, enum.Enum):
    NONE = "none"  # no certification on file — the default, can still be assigned to ordinary activities
    LEVEL_1 = "level_1"
    LEVEL_2 = "level_2"  # required to be assigned to a departure containing a high-risk activity


class GuideProfileStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"  # listed publicly; travelers can book the guide's packages
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class GuideSupervision(Base):
    __tablename__ = "guide_supervision"
    __table_args__ = (
        UniqueConstraint("guide_role_id", "local_expert_role_id", name="uq_guide_supervision_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    local_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    # unique per (guide, expert): a guide can work with several experts, and an ended
    # or declined row is reused if the same expert invites them again.
    guide_role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"))
    status: Mapped[SupervisionStatus] = mapped_column(
        Enum(SupervisionStatus, name="supervision_status"), default=SupervisionStatus.PENDING
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    local_expert_role: Mapped["PartnerRole"] = relationship(foreign_keys=[local_expert_role_id])  # noqa: F821
    guide_role: Mapped["PartnerRole"] = relationship(foreign_keys=[guide_role_id])  # noqa: F821


class GuideAssignment(Base):
    __tablename__ = "guide_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guide_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    tour_departure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tour_departures.id", ondelete="CASCADE"), index=True
    )
    assigned_by_role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"))
    # The fee the expert pays the guide through Ovigo, fixed when assigning: the
    # chosen package's price at that moment, or a custom amount. Null only on
    # assignments made before guide fees went through Ovigo.
    fee_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    package_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("guide_service_packages.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        Enum(AssignmentStatus, name="assignment_status"), default=AssignmentStatus.ASSIGNED
    )
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    guide_role: Mapped["PartnerRole"] = relationship(foreign_keys=[guide_role_id])  # noqa: F821
    tour_departure: Mapped["TourDeparture"] = relationship()  # noqa: F821
    package: Mapped["GuideServicePackage | None"] = relationship()


class GuideAvailability(Base):
    __tablename__ = "guide_availability"
    __table_args__ = (UniqueConstraint("guide_role_id", "date", name="uq_guide_availability_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guide_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    is_available: Mapped[bool] = mapped_column(default=True)


class GuideCertification(Base):
    """Admin-managed guide lifecycle attributes — certification tier/specialty and a
    high-risk-activity restriction that's lighter-weight than a full role suspension
    (PartnerRoleStatus.SUSPENDED, added in Phase 7.6) since it only blocks assignment
    to departures with a high-risk activity, not the guide role entirely. One row per
    guide PartnerRole, created lazily on the first admin update — a guide with no row
    yet is treated as GuideCertificationLevel.NONE / not restricted (see guides/service.py)."""

    __tablename__ = "guide_certifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guide_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), unique=True
    )
    level: Mapped[GuideCertificationLevel] = mapped_column(
        Enum(GuideCertificationLevel, name="guide_certification_level"), default=GuideCertificationLevel.NONE
    )
    specialty: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_restricted: Mapped[bool] = mapped_column(Boolean, default=False)
    restriction_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    guide_role: Mapped["PartnerRole"] = relationship()  # noqa: F821


class GuideProfile(Base):
    """A guide's public listing. One per guide PartnerRole, created lazily as a
    DRAFT. Goes public only after admin review (like vehicles), and only while the
    guide role itself is APPROVED."""

    __tablename__ = "guide_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guide_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), unique=True
    )
    headline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    languages: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    years_experience: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[GuideProfileStatus] = mapped_column(
        Enum(GuideProfileStatus, name="guide_profile_status"), default=GuideProfileStatus.DRAFT
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    guide_role: Mapped["PartnerRole"] = relationship()  # noqa: F821


class GuideServicePackage(Base):
    """A priced service a guide offers, e.g. "Half day" 800 / "Full day" 1400. The
    guide changes prices whenever they like; bookings and assignments copy the
    price when they're made. Never deleted once used, only deactivated, so a
    booking can always say what was bought."""

    __tablename__ = "guide_service_packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guide_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_hours: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
