export type PartnerRoleType = "local_expert" | "host" | "guide" | "hotel" | "rent_a_car";
export type PartnerRoleStatus = "pending" | "approved" | "rejected" | "suspended";
export type ApplicationStatus = "pending" | "approved" | "rejected";
export type DocumentType = "id_card" | "trade_license" | "property_deed" | "vehicle_registration" | "other";
export type DocumentStatus = "pending" | "verified" | "rejected";

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
  other: "Other",
};

export interface PartnerRoleApplication {
  id: string;
  status: ApplicationStatus;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface PartnerDocument {
  id: string;
  document_type: DocumentType;
  file_name: string;
  content_type: string;
  status: DocumentStatus;
  rejection_reason: string | null;
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
}

export interface AdminPartnerRole {
  id: string;
  role_type: PartnerRoleType;
  status: PartnerRoleStatus;
  approved_at: string | null;
  created_at: string;
  documents: PartnerDocument[];
  applicant: AdminUserSummary;
}
