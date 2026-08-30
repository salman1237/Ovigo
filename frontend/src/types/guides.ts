export type SupervisionStatus = "pending" | "accepted" | "rejected" | "terminated";
export type AssignmentStatus = "assigned" | "checked_in" | "completed" | "cancelled";

export interface PersonSummary {
  id: string; // partner_role_id
  full_name: string;
  email: string | null;
}

export interface Supervision {
  id: string;
  status: SupervisionStatus;
  created_at: string;
  responded_at: string | null;
  expert: PersonSummary;
  guide: PersonSummary;
  guide_role_approved: boolean;
}

export interface TourDepartureSummary {
  id: string;
  departure_date: string;
  tour_title: string;
}

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  fee_amount: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  guide: PersonSummary;
  departure: TourDepartureSummary;
}

export interface Availability {
  date: string;
  is_available: boolean;
}

export interface GuideEarnings {
  total_completed_assignments: number;
  total_fees: string;
}

export const SUPERVISION_STATUS_LABELS: Record<SupervisionStatus, string> = {
  pending: "Pending",
  accepted: "Active",
  rejected: "Declined",
  terminated: "Ended",
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  assigned: "Assigned",
  checked_in: "Checked In",
  completed: "Completed",
  cancelled: "Cancelled",
};
