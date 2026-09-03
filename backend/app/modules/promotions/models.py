"""Promotional credit system (technical document Sprint 27-28: "Loyalty, Mobile &
Platform Maturity"). An admin-issued code a traveler can apply at checkout for a
percentage or fixed-amount discount.

Unlike loyalty points (see loyalty/models.py's docstring), a promo redemption is
NOT refunded if its booking is later cancelled — a promo code is a scarce,
admin-controlled promotional resource (often with a hard `max_redemptions` cap), and
refunding it on cancellation would open a trivial book-then-cancel-then-rebook loop
to reuse a one-time code indefinitely. This is a deliberate asymmetry with loyalty
points, which are the user's own previously-earned balance.

Same commission-basis-integrity rule as every other booking-level discount in this
codebase (`bundle_discount_amount`, `tax_service_amount`): the discount is
subtracted from `Booking.total_amount` only, never from any `BookingItem.subtotal`,
so partners are paid in full and Ovigo's own margin absorbs the promotion's cost.
"""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PromoDiscountType(str, enum.Enum):
    PERCENTAGE = "percentage"  # discount_value is a % of the booking total at redemption time
    FIXED_AMOUNT = "fixed_amount"  # discount_value is a flat BDT amount, capped at the booking total


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    discount_type: Mapped[PromoDiscountType] = mapped_column(Enum(PromoDiscountType, name="promo_discount_type"))
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    max_redemptions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    redemption_count: Mapped[int] = mapped_column(Integer, default=0)
    max_redemptions_per_user: Mapped[int] = mapped_column(Integer, default=1)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_admin_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    redemptions: Mapped[list["PromoRedemption"]] = relationship(
        back_populates="promo_code", cascade="all, delete-orphan"
    )


class PromoRedemption(Base):
    __tablename__ = "promo_redemptions"
    __table_args__ = (UniqueConstraint("promo_code_id", "booking_id", name="uq_promo_redemption_booking"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    promo_code_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("promo_codes.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="CASCADE"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    promo_code: Mapped["PromoCode"] = relationship(back_populates="redemptions")
