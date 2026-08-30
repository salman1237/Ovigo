import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator

from app.modules.bookings.models import BookingItemStatus, BookingItemType, BookingStatus


class BookingItemCreate(BaseModel):
    item_type: BookingItemType
    tour_departure_id: uuid.UUID | None = None
    room_type_id: uuid.UUID | None = None
    check_in_date: date | None = None
    check_out_date: date | None = None
    quantity: int = 1

    @model_validator(mode="after")
    def check_fields_for_type(self) -> "BookingItemCreate":
        if self.item_type == BookingItemType.TOUR_DEPARTURE:
            if not self.tour_departure_id:
                raise ValueError("tour_departure_id is required for a tour_departure item")
        elif self.item_type == BookingItemType.ROOM_TYPE:
            if not self.room_type_id or not self.check_in_date or not self.check_out_date:
                raise ValueError("room_type_id, check_in_date and check_out_date are required for a room_type item")
            if self.check_out_date <= self.check_in_date:
                raise ValueError("check_out_date must be after check_in_date")
        elif self.item_type == BookingItemType.CUSTOM_BID:
            # Custom-bid bookings are created server-side by bidding.service.accept_bid,
            # never through this generic endpoint — the price has to come from the
            # accepted bid, not from client input, so this path is deliberately closed.
            raise ValueError("Custom bid bookings are created by accepting a bid, not directly")
        return self


class GuestCreate(BaseModel):
    full_name: str
    age: int | None = None
    id_document: str | None = None


class BookingCreate(BaseModel):
    items: list[BookingItemCreate]
    guests: list[GuestCreate] = []


class BookingItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    item_type: BookingItemType
    status: BookingItemStatus
    tour_departure_id: uuid.UUID | None
    room_type_id: uuid.UUID | None
    custom_bid_id: uuid.UUID | None
    check_in_date: date | None
    check_out_date: date | None
    quantity: int
    unit_price: Decimal
    subtotal: Decimal


class GuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    age: int | None
    id_document: str | None


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    status: BookingStatus
    total_amount: Decimal
    currency: str
    created_at: datetime
    items: list[BookingItemRead] = []
    guests: list[GuestRead] = []
