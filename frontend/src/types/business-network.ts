export type OwnershipType = "owned" | "referred";
export type ReferralStatus = "pending" | "approved" | "rejected";

export interface BusinessReferral {
  id: string;
  business_name: string;
  business_type: string;
  contact_phone: string | null;
  contact_email: string | null;
  description: string | null;
  ownership_type: OwnershipType;
  status: ReferralStatus;
  rejection_reason: string | null;
  linked_partner_role_id: string | null;
  created_at: string;
}

export interface AdminBusinessReferral extends BusinessReferral {
  referring_expert_name: string;
}

export const OWNERSHIP_TYPE_LABELS: Record<OwnershipType, string> = {
  owned: "I own/co-own this",
  referred: "Pure referral",
};

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
