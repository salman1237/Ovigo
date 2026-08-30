"""Guide supervision (technical document Phase 2, Sprint 12-13): a Guide never
operates independently on Ovigo — every Guide's `PartnerRole` (already a generic
role type since Sprint 1-2) is supervised by exactly one approved Local Expert,
who invites them, assigns them to specific tour departures, and vouches for
them. Guide registration & verification themselves reuse the existing generic
partner-role admin approval flow (`/api/v1/admin/partners/roles`) — nothing
guide-specific was needed there since `PartnerRole` was always role-type-generic.

What's new here is the supervision relationship and the assignment/availability/
check-in workflow the technical document's Guide dashboard calls for.

Guide "earnings" are informational only: a per-assignment `fee_amount` the
supervising expert enters when assigning, summed for completed assignments.
This is a private arrangement between expert and guide, not an Ovigo commission
— there's no real payout/ledger movement, consistent with every other
flag-only financial feature so far (escrow release, dispute refunds) pending
Phase 2's later "Financial Engine" sprint.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
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


class GuideSupervision(Base):
    __tablename__ = "guide_supervision"
    __table_args__ = (
        UniqueConstraint("guide_role_id", name="uq_guide_single_supervisor"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    local_expert_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    # unique per guide_role_id: a guide is supervised by at most one expert at a time.
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
    fee_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[AssignmentStatus] = mapped_column(
        Enum(AssignmentStatus, name="assignment_status"), default=AssignmentStatus.ASSIGNED
    )
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    guide_role: Mapped["PartnerRole"] = relationship(foreign_keys=[guide_role_id])  # noqa: F821
    tour_departure: Mapped["TourDeparture"] = relationship()  # noqa: F821


class GuideAvailability(Base):
    __tablename__ = "guide_availability"
    __table_args__ = (UniqueConstraint("guide_role_id", "date", name="uq_guide_availability_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    guide_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    is_available: Mapped[bool] = mapped_column(default=True)
