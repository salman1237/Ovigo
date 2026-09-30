import type { VehicleType } from "@/types/rentcar";

export type RideRequestStatus = "open" | "closed" | "cancelled";
export type RideBidStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export interface RideRequest {
  id: string;
  pickup_label: string;
  pickup_lat: string;
  pickup_lng: string;
  dropoff_label: string;
  dropoff_lat: string;
  dropoff_lng: string;
  departure_date: string;
  departure_time: string | null;
  passengers: number;
  vehicle_type_preference: VehicleType | null;
  with_driver_preference: boolean | null;
  budget_min: string | null;
  budget_max: string | null;
  notes: string | null;
  bid_deadline: string | null;
  status: RideRequestStatus;
  created_at: string;
  bid_count: number;
}

export interface RideBidPartner {
  id: string; // partner_role_id
  full_name: string;
}

export interface RideBidVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
}

export interface RideBid {
  id: string;
  request_id: string;
  price: string;
  message: string | null;
  with_driver: boolean;
  valid_until: string | null;
  status: RideBidStatus;
  created_at: string;
  partner: RideBidPartner;
  vehicle: RideBidVehicle | null;
}

export interface RideBidWithBooking {
  bid: RideBid;
  booking_id: string;
}

export const RIDE_REQUEST_STATUS_LABELS: Record<RideRequestStatus, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const RIDE_BID_STATUS_LABELS: Record<RideBidStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};
