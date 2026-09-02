import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class AnalyticsSummary(BaseModel):
    total_bookings: int
    completed_bookings: int
    cancelled_bookings: int
    gross_revenue: Decimal
    net_earnings: Decimal
    average_rating: float | None
    review_count: int


class TimeseriesPoint(BaseModel):
    period: str  # "YYYY-MM"
    bookings_count: int
    gross_revenue: Decimal
    net_earnings: Decimal


class TopListingRead(BaseModel):
    id: uuid.UUID
    title: str
    bookings_count: int
    gross_revenue: Decimal


class AnalyticsDashboard(BaseModel):
    summary: AnalyticsSummary
    timeseries: list[TimeseriesPoint]
    top_listings: list[TopListingRead]


class HotelPerformanceReport(BaseModel):
    property_id: uuid.UUID
    start_date: date
    end_date: date
    available_room_nights: int
    booked_room_nights: int
    occupancy_rate: float  # booked / available, 0..1
    revenue: Decimal
    adr: Decimal  # Average Daily Rate = revenue / booked_room_nights
    revpar: Decimal  # Revenue Per Available Room = revenue / available_room_nights
