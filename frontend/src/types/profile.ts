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

export interface ExpertUpcomingDeparture {
  departure_id: string;
  tour_id: string;
  tour_title: string;
  departure_date: string;
  return_date: string | null;
  available_seats: number;
  price: string;
}

export interface ExpertAssociatedGuide {
  guide_role_id: string;
  name: string;
  has_public_profile: boolean;
}

export interface ExpertAssociatedProperty {
  property_id: string;
  name: string;
  property_type: string;
}

export interface ExpertTransportService {
  mode: string;
  provider_name: string | null;
  vehicle_type: string | null;
}

/** PRD §8.2. Track-record numbers are computed from real bookings, reviews and
 * chats; null means there's nothing to measure yet. */
export interface PublicLocalExpertProfile {
  partner_role_id: string;
  name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  has_photo: boolean;
  /** API-relative; see lib/media.ts::apiFileUrl. */
  photo_url: string | null;
  primary_destination?: string | null;
  secondary_destinations: string[];
  expertise_categories: string[];
  security_verification_status: "verified" | "pending";
  identity_verified: boolean;
  member_since: string | null;
  emergency_handling_capability: boolean;
  rating_avg: string | null;
  reviews_count: number;
  rating_breakdown: Record<string, number>;
  total_tours_conducted: number;
  completed_bookings: number;
  response_rate_percent: number | null;
  avg_response_minutes: number | null;
  completion_rate_percent: number | null;
  cancellation_rate_percent: number | null;
  tours: TourSummary[];
  upcoming_departures: ExpertUpcomingDeparture[];
  guides: ExpertAssociatedGuide[];
  properties: ExpertAssociatedProperty[];
  transport: ExpertTransportService[];
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
