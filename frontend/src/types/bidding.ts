export type RequestStatus = "open" | "closed" | "cancelled";
export type BidStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface ItineraryDay {
  day_number: number;
  title: string;
  description: string | null;
}

export interface Addon {
  name: string;
  price: string;
}

export interface CustomTourRequest {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  group_size: number;
  adults: number;
  children: number;
  infants: number;
  budget_min: string | null;
  budget_max: string | null;
  pickup_location: string | null;
  food_preference: string | null;
  accessibility_needs: string | null;
  safety_privacy_notes: string | null;
  guide_requested: boolean;
  special_occasion: string | null;
  additional_notes: string | null;
  bid_deadline: string | null;
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
  stay_name: string | null;
  transport_details: string | null;
  food_menu: string | null;
  included_services: string | null;
  excluded_services: string | null;
  addons: Addon[];
  tax_amount: string | null;
  deposit_amount: string | null;
  cancellation_terms: string | null;
  valid_until: string | null;
  is_shortlisted: boolean;
  status: BidStatus;
  created_at: string;
  expert: BidExpert;
}

export interface RequestQuestion {
  id: string;
  request_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
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
