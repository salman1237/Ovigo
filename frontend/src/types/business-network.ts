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
  invite_token: string | null;
  invite_sent_at: string | null;
  invited_user_id: string | null;
  invite_accepted_at: string | null;
  is_business_verified: boolean;
  verified_at: string | null;
  custom_commission_rate: string | null;
  created_at: string;
}

export interface ClaimReferralInfo {
  id: string;
  business_name: string;
  business_type: string;
  description: string | null;
  referring_expert_name: string;
  already_claimed: boolean;
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
