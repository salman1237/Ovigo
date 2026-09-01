export type BadgeType = "verified" | "top_rated" | "couple_friendly" | "safety_certified";
export type BadgeStatus = "pending" | "approved" | "rejected";
export type BadgeEntityType = "partner_role" | "tour" | "property";

export interface Badge {
  id: string;
  entity_type: BadgeEntityType;
  entity_id: string;
  badge_type: BadgeType;
  status: BadgeStatus;
  is_auto_awarded: boolean;
  awarded_at: string | null;
  created_at: string;
}

export interface AdminBadge extends Badge {
  private_note: string | null;
  rejection_reason: string | null;
  applied_by_user_id: string | null;
}

export const BADGE_TYPE_LABELS: Record<BadgeType, string> = {
  verified: "Verified",
  top_rated: "Top Rated",
  couple_friendly: "Couple Friendly",
  safety_certified: "Safety Certified",
};

export const BADGE_STATUS_LABELS: Record<BadgeStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
