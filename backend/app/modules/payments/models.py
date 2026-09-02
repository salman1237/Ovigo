"""Payment sessions and escrow.

Escrow here is deliberately basic (technical document §11.3 calls Phase 1's scope
"basic escrow — hold until completion"): one EscrowTransaction per booking, HELD
the moment payment is validated, RELEASED the moment the booking is marked
COMPLETED. There's no actual money movement modeled — releasing escrow just marks
it ready for the payout process, which is Phase 2 work.

Sprint 23-24 Part 2 ("Additional payment gateways" in the technical document's
Phase 4 plan) adds `BANK_TRANSFER` as a second provider — genuinely implementable
without a third-party credential, unlike Stripe/cards, which need a real provider
account this environment doesn't have (the same "credential not configured" gap
already documented for email/SMS/push notification delivery). A bank transfer is
manual/offline by nature: the traveler is shown Ovigo's transfer instructions,
makes the transfer themselves outside the platform, records the reference number
they were given, and an admin verifies it arrived before the booking confirms —
see payments/service.py's `initiate_bank_transfer` / `submit_bank_reference` /
`verify_bank_transfer`. This reuses the exact same "flag-only, no real money
movement modeled" precedent as escrow/payouts elsewhere in this codebase; the
difference is *when* confirmation happens (an admin's manual click, not a gateway
webhook), not how confirmation is recorded once it does.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaymentProvider(str, enum.Enum):
    SSLCOMMERZ = "sslcommerz"
    BANK_TRANSFER = "bank_transfer"


class PaymentStatus(str, enum.Enum):
    INITIATED = "initiated"
    VALIDATED = "validated"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[PaymentProvider] = mapped_column(
        Enum(PaymentProvider, name="payment_provider"), default=PaymentProvider.SSLCOMMERZ
    )
    tran_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    val_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="BDT")
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.INITIATED)
    gateway_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Traveler-supplied reference number for a BANK_TRANSFER payment — the only
    # provider where confirmation waits on an admin's manual verification rather
    # than a gateway callback (see module docstring).
    bank_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    booking: Mapped["Booking"] = relationship()  # noqa: F821


class EscrowStatus(str, enum.Enum):
    HELD = "held"
    RELEASED = "released"
    REFUNDED = "refunded"


class EscrowTransaction(Base):
    __tablename__ = "escrow_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"), unique=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[EscrowStatus] = mapped_column(Enum(EscrowStatus, name="escrow_status"), default=EscrowStatus.HELD)
    held_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    booking: Mapped["Booking"] = relationship()  # noqa: F821
