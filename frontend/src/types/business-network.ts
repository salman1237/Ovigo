export type BusinessType =
  | "hotel"
  | "resort"
  | "homestay"
  | "guesthouse"
  | "restaurant"
  | "local_transport"
  | "rent_a_car"
  | "activity_provider"
  | "photographer"
  | "local_product_brand"
  | "equipment_rental"
  | "event_cultural"
  | "other";

export type OwnershipType =
  | "owned"
  | "managed"
  | "referred"
  | "partner"
  | "unverified_recommendation";

export type ReferralStatus = "pending" | "approved" | "rejected";

export interface BusinessReferral {
  id: string;
  business_name: string;
  business_type: BusinessType;
  business_type_note: string | null;
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
  business_type: BusinessType;
  business_type_note: string | null;
  description: string | null;
  referring_expert_name: string;
  already_claimed: boolean;
}

export interface AdminBusinessReferral extends BusinessReferral {
  referring_expert_name: string;
}

export interface NetworkBooking {
  booking_id: string;
  partner_name: string;
  item_description: string;
  booking_date: string;
  commission_amount: string;
  commission_rate: string;
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  hotel: "Hotel",
  resort: "Resort",
  homestay: "Homestay",
  guesthouse: "Guesthouse",
  restaurant: "Restaurant",
  local_transport: "Local Transport",
  rent_a_car: "Rent-a-Car",
  activity_provider: "Activity Provider",
  photographer: "Photographer",
  local_product_brand: "Local Product Brand",
  equipment_rental: "Equipment Rental",
  event_cultural: "Event / Cultural",
  other: "Other",
};

export const OWNERSHIP_TYPE_LABELS: Record<OwnershipType, string> = {
  owned: "I own / co-own this business",
  managed: "I manage this business (not an owner)",
  referred: "Pure referral — I know the owner",
  partner: "Registered Ovigo partner",
  unverified_recommendation: "Unverified recommendation",
};

export const OWNERSHIP_TYPE_DESCRIPTIONS: Record<OwnershipType, string> = {
  owned: "You are the owner or co-owner of this business.",
  managed: "You run day-to-day operations but don't hold ownership.",
  referred: "You know the owner and can invite them to Ovigo.",
  partner: "This business is already a registered Ovigo partner.",
  unverified_recommendation: "You recommend this business but can't verify details yet. Cannot earn commission until converted to Referred.",
};

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
