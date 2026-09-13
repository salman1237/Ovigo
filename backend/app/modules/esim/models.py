"""eSIM data plan store (Phase 5, technical document: "Platform Extensions"). Ovigo
resells Triptel's eSIM catalog at a markup, paid for from a prepaid USD wallet at
Triptel — see `TRIPTEL_PARTNER_API.md` (repo root) for the full third-party contract
and `TRIPTEL_ESIM_INTEGRATION_PROMPT.md` for the build spec this module follows.

Deliberately **not** a `BookingItem` type: an eSIM order has no check-in/out, no
partner, no commission, no escrow, and no inventory to reserve — it's a direct
Ovigo-to-traveler resale, not a marketplace booking. Keeping it in its own module
means nothing about the existing `bookings`/`payments`/`commissions` engine has to
bend to accommodate a product that doesn't fit its shape.

`EsimOrder.status` is a state machine (see `service.py::_ALLOWED_TRANSITIONS` for the
single place transitions are validated):

    pending_payment -> paid | cancelled
    paid            -> provisioning | completed | refund_pending
    provisioning    -> completed | refund_pending
    refund_pending  -> refunded

`completed`, `refunded` and `cancelled` are terminal. Repeating a transition to the
status an order is already in is a no-op, not an error — both the Triptel webhook and
this app's own page-driven polling can reach the same order at nearly the same time.

Every product/money field is a **snapshot at order time** (`triptel_product_id`
through `price_bdt`), not a live join to a catalog Triptel itself owns — Triptel's
prices and catalog can change under us, but a traveler must see and pay exactly what
they were quoted, forever, even if the product is later discontinued.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EsimOrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "pending_payment"  # created, traveler hasn't paid yet
    PAID = "paid"  # SSLCommerz payment validated; not yet accepted by Triptel
    PROVISIONING = "provisioning"  # Triptel accepted the order (PROCESSING on their side)
    COMPLETED = "completed"  # eSIM delivered
    REFUND_PENDING = "refund_pending"  # paid, but the eSIM could not be delivered
    REFUNDED = "refunded"  # an admin confirmed the traveler was refunded
    CANCELLED = "cancelled"  # abandoned or failed payment, never paid


class EsimOrder(Base):
    __tablename__ = "esim_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[EsimOrderStatus] = mapped_column(
        Enum(EsimOrderStatus, name="esim_order_status"), default=EsimOrderStatus.PENDING_PAYMENT
    )

    # Product snapshot, frozen at order time — see module docstring.
    triptel_product_id: Mapped[str] = mapped_column(String(100))
    product_title: Mapped[str] = mapped_column(String(255))
    country_iso2: Mapped[str] = mapped_column(String(2))
    country_name: Mapped[str] = mapped_column(String(255))
    data_amount_gb: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    is_unlimited: Mapped[bool] = mapped_column(Boolean, default=False)
    validity_days: Mapped[int] = mapped_column(Integer)

    # Money snapshot — what Triptel charges Ovigo's wallet (USD) vs. what the
    # traveler pays (BDT), and the pricing-config values used to derive the latter
    # from the former, all frozen at order time.
    cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 4))
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    markup_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    price_bdt: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="BDT")

    # SSLCommerz payment fields — same shape as payments.models.Payment, kept local
    # to this module rather than reusing that table since an eSIM order isn't a
    # Booking and Payment.booking_id is required there.
    tran_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True, nullable=True)
    val_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gateway_response: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Triptel-side order tracking.
    triptel_order_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    triptel_order_no: Mapped[str | None] = mapped_column(String(100), nullable=True)
    triptel_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Delivered eSIM activation data — sensitive, only ever returned to the owning
    # traveler or an admin.
    iccid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lpa_string: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_code_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    smdp_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    matching_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    install_links: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Failure / manual-refund tracking — see service.py's module docstring on why
    # traveler-side refunds are a manual admin action, not automated.
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refunded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    refund_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id])  # noqa: F821


class EsimPricingConfig(Base):
    """A single row (created with defaults on first read — see service.py). Editing
    it is how an admin sets the traveler-facing markup, or disables the whole store
    (`is_enabled = False`) without a redeploy."""

    __tablename__ = "esim_pricing_config"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    usd_to_bdt_rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("125.0000"))
    markup_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("15.00"))
    rounding_step_bdt: Mapped[int] = mapped_column(Integer, default=10)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
