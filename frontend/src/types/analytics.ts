export interface AnalyticsSummary {
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  gross_revenue: string;
  net_earnings: string;
  average_rating: number | null;
  review_count: number;
}

export interface TimeseriesPoint {
  period: string;
  bookings_count: number;
  gross_revenue: string;
  net_earnings: string;
}

export interface TopListing {
  id: string;
  title: string;
  bookings_count: number;
  gross_revenue: string;
}

export interface AnalyticsDashboard {
  summary: AnalyticsSummary;
  timeseries: TimeseriesPoint[];
  top_listings: TopListing[];
}

export interface HotelPerformanceReport {
  property_id: string;
  start_date: string;
  end_date: string;
  available_room_nights: number;
  booked_room_nights: number;
  occupancy_rate: number;
  revenue: string;
  adr: string;
  revpar: string;
}
