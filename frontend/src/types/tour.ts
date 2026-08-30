export type TourStatus = "draft" | "pending_review" | "published" | "rejected";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface ItineraryDay {
  id: string;
  day_number: number;
  title: string;
  description: string | null;
}

export interface Departure {
  id: string;
  departure_date: string;
  available_seats: number;
  price_override: string | null;
}

export interface Meal {
  id: string;
  meal_type: MealType;
  description: string | null;
}

export interface Activity {
  id: string;
  name: string;
  description: string | null;
  is_included: boolean;
}

export interface Addon {
  id: string;
  name: string;
  description: string | null;
  price: string;
}

export interface Transport {
  id: string;
  mode: string;
  description: string | null;
}

export interface TourStay {
  id: string;
  property_id: string | null;
  description: string;
  nights: number;
}

export interface TourImage {
  id: string;
  file_name: string;
  sort_order: number;
}

export interface Tour {
  id: string;
  local_expert_role_id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_days: number;
  base_price: string;
  max_group_size: number;
  status: TourStatus;
  rejection_reason: string | null;
  created_at: string;
  images: TourImage[];
  itinerary: ItineraryDay[];
  departures: Departure[];
  meals: Meal[];
  activities: Activity[];
  addons: Addon[];
  transport: Transport[];
  stays: TourStay[];
}

export interface TourSummary {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_days: number;
  base_price: string;
  status: TourStatus;
}
