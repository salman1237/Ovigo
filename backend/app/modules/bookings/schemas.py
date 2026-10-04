import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator

from app.modules.bookings.models import AcquisitionChannel, BookingItemStatus, BookingItemType, BookingStatus


class BookingItemCreate(BaseModel):
    item_type: BookingItemType
    tour_departure_id: uuid.UUID | None = None
    room_type_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    # A guide service: the guide's package, booked for one date (check_in_date).
    guide_package_id: uuid.UUID | None = None
    check_in_date: date | None = None
    check_out_date: date | None = None
    quantity: int = 1
    # Booking a stay that a tour includes (TourStay.property_id), through that tour —
    # credits the tour's Local Expert a tour-curation commission (PRD §12.4).
    via_tour_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def check_fields_for_type(self) -> "BookingItemCreate":
        if self.via_tour_id is not None and self.item_type != BookingItemType.ROOM_TYPE:
            raise ValueError("via_tour_id only applies to a room_type item")
        if self.item_type == BookingItemType.TOUR_DEPARTURE:
            if not self.tour_departure_id:
                raise ValueError("tour_departure_id is required for a tour_departure item")
        elif self.item_type == BookingItemType.ROOM_TYPE:
            if not self.room_type_id or not self.check_in_date or not self.check_out_date:
                raise ValueError("room_type_id, check_in_date and check_out_date are required for a room_type item")
            if self.check_out_date <= self.check_in_date:
                raise ValueError("check_out_date must be after check_in_date")
        elif self.item_type == BookingItemType.VEHICLE_RENTAL:
            if not self.vehicle_id or not self.check_in_date or not self.check_out_date:
                raise ValueError("vehicle_id, check_in_date and check_out_date are required for a vehicle_rental item")
            if self.check_out_date <= self.check_in_date:
                raise ValueError("check_out_date must be after check_in_date")
            if self.quantity != 1:
                raise ValueError("A vehicle rental item's quantity must be 1 — each Vehicle is one specific car")
        elif self.item_type == BookingItemType.GUIDE_SERVICE:
            if not self.guide_package_id or not self.check_in_date:
                raise ValueError("guide_package_id and check_in_date (the service date) are required for a guide_service item")
            if self.check_out_date is not None:
                raise ValueError("A guide service is for one date — send check_in_date only")
            if self.quantity != 1:
                raise ValueError("A guide service item's quantity must be 1 — add one item per date")
        elif self.item_type == BookingItemType.CUSTOM_BID:
            # Custom-bid bookings are created server-side by bidding.service.accept_bid,
            # never through this generic endpoint — the price has to come from the
            # accepted bid, not from client input, so this path is deliberately closed.
            raise ValueError("Custom bid bookings are created by accepting a bid, not directly")
        elif self.item_type == BookingItemType.RIDE_BID:
            # Same reasoning as CUSTOM_BID above — created by ride_requests.service.accept_bid.
            raise ValueError("Ride bid bookings are created by accepting a bid, not directly")
        return self


class GuestCreate(BaseModel):
    full_name: str
    age: int | None = None
    id_document: str | None = None


class BookingCreate(BaseModel):
    items: list[BookingItemCreate]
    guests: list[GuestCreate] = []
    redeem_points: int = 0
    promo_code: str | None = None
    # The sponsored-ad campaign the traveler clicked through, if any — only honored
    # when that campaign actually advertises one of this booking's items.
    ad_campaign_id: uuid.UUID | None = None


class BookingItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_type: BookingItemType
    status: BookingItemStatus
    tour_departure_id: uuid.UUID | None
    room_type_id: uuid.UUID | None
    custom_bid_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    guide_package_id: uuid.UUID | None = None
    check_in_date: date | None
    check_out_date: date | None
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    assigned_room_id: uuid.UUID | None
    curated_by_tour_id: uuid.UUID | None = None


class GuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    age: int | None
    id_document: str | None


class FrontDeskBookingCreate(BaseModel):
    guest_name: str
    guest_email: str
    items: list[BookingItemCreate]

    @model_validator(mode="after")
    def check_room_items_only(self) -> "FrontDeskBookingCreate":
        if not self.items:
            raise ValueError("A booking needs at least one item")
        if any(item.item_type != BookingItemType.ROOM_TYPE for item in self.items):
            raise ValueError("Front-desk bookings can only include room_type items")
        return self


class RoomAssignRequest(BaseModel):
    room_id: uuid.UUID


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    status: BookingStatus
    total_amount: Decimal
    tax_service_amount: Decimal
    bundle_discount_amount: Decimal
    loyalty_discount_amount: Decimal
    promo_discount_amount: Decimal
    currency: str
    acquisition_channel: AcquisitionChannel | None = None
    created_at: datetime
    items: list[BookingItemRead] = []
    guests: list[GuestRead] = []
