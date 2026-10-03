import type { TourSummary } from "./tour";

export interface LocalExpertProfile {
  id: string;
  partner_role_id: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  is_published: boolean;
  has_photo: boolean;
  primary_destination_id?: string | null;
  secondary_destinations?: string[] | null;
  expertise_categories?: string[] | null;
  security_verification_status?: string;
  emergency_handling_capability?: boolean;
  emergency_contact_number?: string | null;
  rating_avg?: string | number;
  reviews_count?: number;
  total_tours_conducted?: number;
  response_rate_percent?: number;
  completion_rate_percent?: number;
  cancellation_rate_percent?: number;
  badge_level?: string;
  created_at: string;
}

export interface PublicLocalExpertProfile {
  partner_role_id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  has_photo: boolean;
  photo_url: string | null;
  primary_destination?: string | null;
  secondary_destinations: string[];
  expertise_categories: string[];
  security_verification_status: string;
  emergency_handling_capability: boolean;
  rating_avg: string | number;
  reviews_count: number;
  total_tours_conducted: number;
  response_rate_percent: number;
  completion_rate_percent: number;
  cancellation_rate_percent: number;
  badge_level: string;
  tours: TourSummary[];
}

export interface HostProfile {
  id: string;
  partner_role_id: string;
  business_name: string | null;
  bio: string | null;
  is_published: boolean;
  has_photo: boolean;
  created_at: string;
}
