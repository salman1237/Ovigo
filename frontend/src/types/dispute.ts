export type DisputeStatus = "open" | "resolved";
export type DisputeResolution = "refunded" | "rejected";

export interface DisputeRaisedBy {
  id: string;
  full_name: string;
  email: string | null;
}

export interface Dispute {
  id: string;
  booking_id: string;
  raised_by: DisputeRaisedBy;
  raised_by_role: "traveler" | "partner";
  reason: string;
  status: DisputeStatus;
  resolution: DisputeResolution | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}
