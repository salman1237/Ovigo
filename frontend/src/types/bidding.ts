export type RequestStatus = "open" | "closed" | "cancelled";
export type BidStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface ItineraryDay {
  day_number: number;
  title: string;
  description: string | null;
}

export interface CustomTourRequest {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  group_size: number;
  budget_min: string | null;
  budget_max: string | null;
  status: RequestStatus;
  created_at: string;
  bid_count: number;
}

export interface BidExpert {
  id: string; // partner_role_id
  full_name: string;
}

export interface TourBid {
  id: string;
  request_id: string;
  price: string;
  message: string | null;
  itinerary: ItineraryDay[];
  status: BidStatus;
  created_at: string;
  expert: BidExpert;
}

export interface BidWithBooking {
  bid: TourBid;
  booking_id: string;
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const BID_STATUS_LABELS: Record<BidStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};
