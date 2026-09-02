"""Properties (stays), room types, per-date availability, and rate plans.

Deliberate simplifications vs. the technical document's full schema (documented so
they're easy to revisit): `property_policies` is embedded as columns on `properties`
rather than a separate table — it's a genuine 1:1 relationship with no independent
lifecycle, so splitting it buys nothing yet. `availability_calendars` doubles as the
inventory ledger (`available_units` per room type per date) and carries an optional
per-date `price_override`, which stays the single highest-priority override — a host
who's manually set a specific date's price already gets exactly what they asked for,
before any `RatePlan` is even considered.

Sprint 19-20 ("Advanced Pricing Engine" in the technical document's own phase plan)
adds `RatePlan`: named, conditional adjustments to `RoomType.base_price` (seasonal
date ranges, weekend upcharges, early-bird and group discounts). Deliberate scope
trims:
- **One rate type field, generic conditions.** `rate_type` (seasonal/weekend/
  corporate/group/early_bird) is a descriptive label for the host's own organization,
  not something the resolution engine branches on — a plan qualifies for a given
  night purely from its own conditions (date range, weekend flag, min-days-before-
  check-in, min-quantity), so a "corporate" plan and a "seasonal" plan with the same
  date-range condition behave identically. No corporate-account/coupon-code gating
  exists (or is asked for) — "corporate" here just means "a plan a host applies to
  a negotiated date range," same mechanism as "seasonal."
- **Cheapest-applicable-plan wins**, not a fixed type-priority ladder. If multiple
  plans qualify for the same night, the one giving the guest the lowest price is
  used — simple, deterministic, and avoids inventing an arbitrary priority ordering
  between "seasonal" and "early bird" that the technical document never specifies.
- **"Min stay" is a hard `RoomType.min_stay_nights` constraint**, not a RatePlan
  discount condition — a booking shorter than the minimum is rejected outright
  (matching how real booking platforms treat it), separate from the plans that only
  affect price.
- **No traveler-facing "you got X% off" messaging** — the resolved nightly rate is
  simply what's charged; which plan (if any) produced it isn't surfaced to the
  guest in this pass, mirroring the trust-badge precedent of keeping v1 minimal.

Sprint 19-20 Part 2 ("Hotel Features" in the technical document's phase plan) adds
`PropertyStaff` (role-based staff accounts) and `Room` (individual physical rooms,
for housekeeping). Deliberate scope trims:
- **Staff invitation mirrors the existing Guide-invite pattern** (`guides/service.py
  ::invite_guide`): the invitee must already have an Ovigo account (found by email),
  and a `PENDING` invite becomes `ACTIVE` only once they accept it — a host can't
  silently grant themselves access to someone else's account. Unlike a Guide role,
  there's no admin-approval step: staff access is purely internal to one host's own
  property, not a new public-facing partner category.
- **Three flat staff roles, no per-permission matrix.** `MANAGER` implies every
  permission; `FRONT_DESK` covers booking/check-in/check-out; `HOUSEKEEPING` covers
  room-status updates only. A fine-grained permission system isn't asked for by the
  technical document and would be speculative machinery for a single-tenant-per-
  property feature.
- **`Room` is an operational layer on top of `RoomType.total_units`, not a
  replacement for it.** Booking availability still runs on the existing pooled
  `AvailabilityCalendar` counts (unchanged, already battle-tested) — individual
  `Room` rows exist so housekeeping status can be tracked per physical room and so
  front-desk staff can optionally assign a specific room number to a booking at
  check-in (`BookingItem.assigned_room_id`). Room assignment does not gate or
  double-book-check against the pooled availability count; it's a convenience
  field, not a second source of truth for inventory.

Sprint 23-24 ("External Integrations" in the technical document's Phase 4 plan)
adds iCal export/import per `RoomType` (see `stays/service.py::export_ical` /
`import_ical`, and `core/ical.py` for the RFC 5545 handling itself) — the
"iCal import/export for stays" and "external calendar sync" line items. Scope
trims:
- **One `.ics` feed per `RoomType`, gated by a random unguessable token** (not a
  JWT) — matching exactly how Airbnb/Booking.com/Google Calendar's own "secret
  calendar URL" export links work, since the consumer is a third-party calendar
  app that can't send an Ovigo bearer token.
- **Import always blocks the full date range at `available_units=0`**, regardless
  of `RoomType.total_units` — correct for the common case this feature targets
  (one external OTA listing syncing back to one Ovigo room type) and avoids
  building partial-unit conflict resolution the technical document doesn't ask
  for. There's no tracking of *why* a date is blocked (host-set vs.
  import-derived); a re-import simply re-zeroes the same dates, which is
  idempotent and safe.
- **No two-way write-back to the external calendar** — Ovigo consumes an external
  .ics feed to protect against double-booking, but doesn't (and structurally
  can't, without that platform's own API) push Ovigo bookings back into Airbnb's
  own calendar. The "channel manager integration API" / "PMS integration hooks"
  line items are what let an external system pull Ovigo's own availability
  programmatically instead — see the `integrations` module.
"""
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PropertyType(str, enum.Enum):
    HOTEL = "hotel"
    RESORT = "resort"
    HOMESTAY = "homestay"
    GUESTHOUSE = "guesthouse"


class PropertyStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    PUBLISHED = "published"
    REJECTED = "rejected"


class RatePlanType(str, enum.Enum):
    SEASONAL = "seasonal"
    WEEKEND = "weekend"
    CORPORATE = "corporate"
    GROUP = "group"
    EARLY_BIRD = "early_bird"


class RatePlanAdjustmentType(str, enum.Enum):
    PERCENTAGE = "percentage"  # adjustment_value is a % delta from base_price — negative discounts, positive surcharges
    FIXED_PRICE = "fixed_price"  # adjustment_value replaces base_price outright on a matching night


class StaffRole(str, enum.Enum):
    MANAGER = "manager"  # implies every permission below
    FRONT_DESK = "front_desk"  # booking creation, check-in, check-out, room assignment
    HOUSEKEEPING = "housekeeping"  # room housekeeping-status updates only


class StaffStatus(str, enum.Enum):
    PENDING = "pending"  # invited, awaiting the staff member's response
    ACTIVE = "active"
    REVOKED = "revoked"  # declined, or removed by the host after being active


class HousekeepingStatus(str, enum.Enum):
    CLEAN = "clean"
    DIRTY = "dirty"
    CLEANING_IN_PROGRESS = "cleaning_in_progress"
    OUT_OF_ORDER = "out_of_order"


class AmenityKey(str, enum.Enum):
    WIFI = "wifi"
    POOL = "pool"
    PARKING = "parking"
    AC = "ac"
    BREAKFAST_INCLUDED = "breakfast_included"
    PET_FRIENDLY = "pet_friendly"
    AIRPORT_PICKUP = "airport_pickup"
    TV = "tv"
    HOT_WATER = "hot_water"
    KITCHEN = "kitchen"


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    property_type: Mapped[PropertyType] = mapped_column(Enum(PropertyType, name="property_type"))
    status: Mapped[PropertyStatus] = mapped_column(
        Enum(PropertyStatus, name="property_status"), default=PropertyStatus.DRAFT
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Policies (embedded — see module docstring)
    check_in_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    check_out_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cancellation_policy: Mapped[str | None] = mapped_column(Text, nullable=True)
    house_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    children_allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    pets_allowed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Percentages (e.g. 15.00 = 15%), applied to a room booking's pre-tax subtotal at
    # booking time — see bookings/service.py's create_booking. Kept out of
    # BookingItem.subtotal itself (which stays pre-tax) since Commission.gross_amount
    # is derived from subtotal — Ovigo doesn't take a commission cut of tax/service
    # charges collected on the property's behalf.
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    service_charge_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    host_role: Mapped["PartnerRole"] = relationship()  # noqa: F821
    room_types: Mapped[list["RoomType"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    amenities: Mapped[list["PropertyAmenity"]] = relationship(back_populates="property", cascade="all, delete-orphan")
    images: Mapped[list["PropertyImage"]] = relationship(
        back_populates="property", cascade="all, delete-orphan", order_by="PropertyImage.sort_order"
    )


class PropertyAmenity(Base):
    __tablename__ = "property_amenities"
    __table_args__ = (UniqueConstraint("property_id", "amenity", name="uq_property_amenity"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"))
    amenity: Mapped[AmenityKey] = mapped_column(Enum(AmenityKey, name="amenity_key"))

    property: Mapped["Property"] = relationship(back_populates="amenities")


class RoomType(Base):
    __tablename__ = "room_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_occupancy: Mapped[int] = mapped_column(Integer, default=2)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    total_units: Mapped[int] = mapped_column(Integer, default=1)
    min_stay_nights: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # A random, unguessable token gating this room type's public .ics export feed
    # (see stays/service.py::export_ical) — generated lazily on first request for
    # one, not at row-creation time, so most room types never need the column
    # touched at all.
    ical_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    property: Mapped["Property"] = relationship(back_populates="room_types")
    availability: Mapped[list["AvailabilityCalendar"]] = relationship(
        back_populates="room_type", cascade="all, delete-orphan"
    )
    rate_plans: Mapped[list["RatePlan"]] = relationship(back_populates="room_type", cascade="all, delete-orphan")
    rooms: Mapped[list["Room"]] = relationship(back_populates="room_type", cascade="all, delete-orphan")


class AvailabilityCalendar(Base):
    __tablename__ = "availability_calendars"
    __table_args__ = (UniqueConstraint("room_type_id", "date", name="uq_availability_date"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_type_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("room_types.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date)
    available_units: Mapped[int] = mapped_column(Integer)
    price_override: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    room_type: Mapped["RoomType"] = relationship(back_populates="availability")


class RatePlan(Base):
    __tablename__ = "rate_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("room_types.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    rate_type: Mapped[RatePlanType] = mapped_column(Enum(RatePlanType, name="rate_plan_type"))
    adjustment_type: Mapped[RatePlanAdjustmentType] = mapped_column(
        Enum(RatePlanAdjustmentType, name="rate_plan_adjustment_type")
    )
    adjustment_value: Mapped[Decimal] = mapped_column(Numeric(10, 2))

    # Qualifying conditions — a plan applies to a given night only if every condition
    # it sets is satisfied (see stays/service.py::resolve_nightly_rate). At least one
    # must be set (enforced in the Pydantic schema) so a plan can't silently apply to
    # every night forever.
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    applies_to_weekends: Mapped[bool] = mapped_column(Boolean, default=False)
    min_days_before_checkin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    room_type: Mapped["RoomType"] = relationship(back_populates="rate_plans")


class PropertyStaff(Base):
    __tablename__ = "property_staff"
    __table_args__ = (UniqueConstraint("property_id", "user_id", name="uq_property_staff_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    staff_role: Mapped[StaffRole] = mapped_column(Enum(StaffRole, name="staff_role"))
    status: Mapped[StaffStatus] = mapped_column(Enum(StaffStatus, name="staff_status"), default=StaffStatus.PENDING)
    invited_by_role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_roles.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    property: Mapped["Property"] = relationship()
    user: Mapped["User"] = relationship()  # noqa: F821


class Room(Base):
    __tablename__ = "rooms"
    __table_args__ = (UniqueConstraint("room_type_id", "room_number", name="uq_room_number_per_type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("room_types.id", ondelete="CASCADE"), index=True
    )
    room_number: Mapped[str] = mapped_column(String(20))
    housekeeping_status: Mapped[HousekeepingStatus] = mapped_column(
        Enum(HousekeepingStatus, name="housekeeping_status"), default=HousekeepingStatus.CLEAN
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    room_type: Mapped["RoomType"] = relationship(back_populates="rooms")


class PropertyImage(Base):
    __tablename__ = "property_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"))
    storage_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    file_name: Mapped[str] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    property: Mapped["Property"] = relationship(back_populates="images")
