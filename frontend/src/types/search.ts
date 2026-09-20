import type { Property } from "@/types/stay";
import type { TourSummary } from "@/types/tour";
import type { Vehicle } from "@/types/rentcar";

export interface DestinationSummary {
  id: string;
  name: string;
  slug: string;
  type: string;
  published_tour_count: number;
  published_property_count: number;
  published_vehicle_count: number;
  cover_tour_id: string | null;
  cover_tour_image_id: string | null;
  cover_property_id: string | null;
  cover_property_image_id: string | null;
}

export interface LocationBreadcrumbItem {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export interface ExpertSearchResult {
  partner_role_id: string;
  full_name: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[] | null;
  successful_tour_count: number;
}

export interface DestinationDetail extends DestinationSummary {
  breadcrumb: LocationBreadcrumbItem[];
  tours: TourSummary[];
  stays: Property[];
  vehicles: Vehicle[];
  experts: ExpertSearchResult[];
  nearby: DestinationSummary[];
}
