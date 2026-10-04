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
  package: { id: string; name: string } | null;
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

export type GuideCertificationLevel = "none" | "level_1" | "level_2";

export interface GuideCertification {
  level: GuideCertificationLevel;
  specialty: string | null;
  is_restricted: boolean;
  restriction_reason: string | null;
}

export interface GuideAdminSummary {
  role: PersonSummary;
  role_status: string;
  certification: GuideCertification;
  total_completed_assignments: number;
}

export const GUIDE_CERTIFICATION_LABELS: Record<GuideCertificationLevel, string> = {
  none: "Not certified",
  level_1: "Level 1",
  level_2: "Level 2",
};

// --- Guide services (Phase 9.3): public profile, priced packages, direct bookings ---

export type GuideProfileStatus = "draft" | "pending_review" | "published" | "rejected" | "suspended";

export interface GuideProfile {
  guide_role_id: string;
  headline: string | null;
  bio: string | null;
  city: string | null;
  languages: string[] | null;
  years_experience: number | null;
  status: GuideProfileStatus;
  rejection_reason: string | null;
  updated_at: string;
}

export interface GuidePackage {
  id: string;
  name: string;
  description: string | null;
  duration_hours: string | null;
  price: string;
  is_active: boolean;
}

export interface PublicGuideSummary {
  guide_role_id: string;
  full_name: string;
  headline: string | null;
  city: string | null;
  languages: string[];
  years_experience: number | null;
  certification_level: GuideCertificationLevel;
  from_price: string;
  package_count: number;
}

export interface PublicGuideDetail extends PublicGuideSummary {
  bio: string | null;
  completed_assignments: number;
  packages: GuidePackage[];
}

export interface GuideBooking {
  item_id: string;
  booking_id: string;
  service_date: string;
  package_name: string;
  price: string;
  booking_status: string;
  item_status: string;
  traveler_name: string;
  traveler_email: string | null;
}

export interface AdminGuideProfile {
  guide: PersonSummary;
  role_status: string;
  profile: GuideProfile;
  packages: GuidePackage[];
}

export const GUIDE_PROFILE_STATUS_LABELS: Record<GuideProfileStatus, string> = {
  draft: "Draft",
  pending_review: "Under review",
  published: "Live",
  rejected: "Changes needed",
  suspended: "Suspended",
};

export function packageDuration(pkg: Pick<GuidePackage, "duration_hours">): string | null {
  if (!pkg.duration_hours) return null;
  const hours = Number(pkg.duration_hours);
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr${hours === 1 ? "" : "s"}`;
}
