export type PartnerRoleType = "local_expert" | "host" | "guide" | "hotel" | "rent_a_car";
export type PartnerRoleStatus = "pending" | "approved" | "rejected" | "suspended";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type DocumentType =
  | "id_card"
  | "trade_license"
  | "property_deed"
  | "vehicle_registration"
  | "utility_bill"
  | "fitness_certificate"
  | "insurance"
  | "driver_license"
  | "police_clearance"
  | "first_aid_certificate"
  | "other";
export type DocumentStatus = "pending" | "verified" | "rejected";
export type NationalIdType = "id_card" | "passport";
export type PayoutMethod = "bank" | "mobile_financial_service";

export const ROLE_LABELS: Record<PartnerRoleType, string> = {
  local_expert: "Local Expert",
  host: "Host",
  guide: "Guide",
  hotel: "Hotel / Resort",
  rent_a_car: "Rent-a-Car",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  id_card: "ID Card",
  trade_license: "Trade License",
  property_deed: "Property Deed",
  vehicle_registration: "Vehicle Registration",
  utility_bill: "Utility Bill",
  fitness_certificate: "Fitness Certificate",
  insurance: "Insurance",
  driver_license: "Driver's License",
  police_clearance: "Police Clearance",
  first_aid_certificate: "First Aid Certificate",
  other: "Other",
};

export interface PartnerRoleApplication {
  id: string;
  status: ApplicationStatus;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  full_legal_name?: string | null;
  contact_mobile_number?: string | null;
  national_id_type?: NationalIdType | null;
  national_id_number?: string | null;
  permanent_address?: string | null;
  current_address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  payout_method?: PayoutMethod | null;
  payout_provider_name?: string | null;
  payout_account_name?: string | null;
  payout_account_number?: string | null;
  tax_id?: string | null;
  agreed_to_partner_terms?: boolean | null;
  agreed_to_background_check?: boolean | null;
  role_details?: Record<string, unknown> | null;
}

export interface PartnerDocument {
  id: string;
  document_type: DocumentType;
  file_name: string;
  content_type: string;
  status: DocumentStatus;
  rejection_reason: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface PartnerRole {
  id: string;
  role_type: PartnerRoleType;
  status: PartnerRoleStatus;
  approved_at: string | null;
  created_at: string;
  applications: PartnerRoleApplication[];
  documents: PartnerDocument[];
}

export interface AdminUserSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface AdminPartnerRole {
  id: string;
  role_type: PartnerRoleType;
  status: PartnerRoleStatus;
  approved_at: string | null;
  created_at: string;
  documents: PartnerDocument[];
  applicant: AdminUserSummary;
  applications?: PartnerRoleApplication[];
  profile_details?: {
    headline?: string | null;
    bio?: string | null;
    years_experience?: number | null;
    languages?: string[] | null;
    secondary_destinations?: string[] | null;
    expertise_categories?: string[] | null;
    emergency_handling_capability?: boolean | null;
    emergency_contact_number?: string | null;
    security_verification_status?: string | null;
    badge_level?: string | null;
    is_trusted?: boolean | null;
  } | null;
}

export interface AdminExpiringDocument {
  id: string;
  document_type: DocumentType;
  expiry_date: string;
  partner_role_id: string;
  role_type: PartnerRoleType;
  applicant: AdminUserSummary;
}

export function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

export function isExpiringSoon(dateStr: string | null, withinDays = 30): boolean {
  if (!dateStr) return false;
  const days = (new Date(dateStr).getTime() - Date.now()) / 86_400_000;
  return days >= 0 && days <= withinDays;
}
