import type { PartnerRoleType } from "@/types/partner";

export type JoinableRoleType = Exclude<PartnerRoleType, "local_expert">;
export type NetworkMemberStatus = "pending" | "active" | "expired" | "rejected" | "revoked";
export type AttributionSource = "referral_link" | "business_referral" | "admin";

export const JOINABLE_ROLE_TYPES: JoinableRoleType[] = ["guide", "host", "hotel", "rent_a_car"];

export interface ReferralLinkStats {
  visits: number;
  signups: number;
  pending: number;
  active: number;
  expired: number;
  expiring_soon: number;
  network_earnings_pending: string;
  network_earnings_payable: string;
  network_earnings_paid: string;
}

export interface ReferralLink {
  code: string;
  url: string;
  role_urls: Record<JoinableRoleType, string>;
  created_at: string;
  attribution_months: number;
  stats: ReferralLinkStats;
}

export interface NetworkMember {
  id: string;
  member_name: string;
  role_type: JoinableRoleType;
  source: AttributionSource;
  status: NetworkMemberStatus;
  role_approved: boolean;
  commission_starts_at: string | null;
  commission_expires_at: string | null;
  custom_commission_rate: string | null;
  joined_at: string;
  completed_bookings: number;
  earnings_pending: string;
  earnings_payable: string;
  earnings_paid: string;
}

export interface PublicReferralLink {
  code: string;
  expert_role_id: string;
  expert_name: string;
  headline: string | null;
  photo_url: string | null;
  primary_destination: string | null;
  years_experience: number | null;
  allowed_role_types: JoinableRoleType[];
}

export interface AdminNetworkAttribution {
  id: string;
  referring_expert_role_id: string;
  referring_expert_name: string;
  referred_user_id: string;
  referred_partner_role_id: string;
  member_name: string;
  role_type: PartnerRoleType;
  source: AttributionSource;
  stored_status: "pending" | "active" | "rejected" | "revoked";
  status: NetworkMemberStatus;
  custom_commission_rate: string | null;
  commission_starts_at: string | null;
  commission_expires_at: string | null;
  terms_accepted_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  total_network_commission: string;
}

export const MEMBER_STATUS_LABELS: Record<NetworkMemberStatus, string> = {
  pending: "Pending approval",
  active: "Active",
  expired: "Expired",
  rejected: "Rejected",
  revoked: "Revoked",
};

export const MEMBER_STATUS_VARIANTS: Record<NetworkMemberStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  pending: "warning",
  active: "success",
  expired: "neutral",
  rejected: "danger",
  revoked: "danger",
};

export const SOURCE_LABELS: Record<AttributionSource, string> = {
  referral_link: "Referral link",
  business_referral: "Business referral",
  admin: "Assigned by Ovigo",
};
