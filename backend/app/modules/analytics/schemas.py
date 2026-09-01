import uuid
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
