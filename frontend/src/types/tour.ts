export type TourStatus = "draft" | "pending_review" | "published" | "rejected";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type TourType =
  | "adventure"
  | "romantic"
  | "cultural"
  | "wildlife"
  | "beach"
  | "family"
  | "trekking"
  | "city"
  | "cruise"
  | "religious";

export const TOUR_TYPE_LABELS: Record<TourType, string> = {
  adventure: "Adventure",
  romantic: "Romantic",
  cultural: "Cultural",
  wildlife: "Wildlife",
  beach: "Beach",
  family: "Family",
  trekking: "Trekking",
  city: "City",
  cruise: "Cruise",
  religious: "Religious",
};

export interface ItineraryDay {
  id: string;
  day_number: number;
  title: string;
  description: string | null;
  location_name: string | null;
  arrival_time: string | null;
  departure_time: string | null;
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
  duration_hours: string | null;
  location_name: string | null;
  difficulty: string | null;
  min_age: number | null;
  equipment_needed: string | null;
  max_capacity: number | null;
  safety_notes: string | null;
  guide_required: boolean;
  is_high_risk: boolean;
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
  vehicle_type: string | null;
  has_ac: boolean | null;
  capacity: number | null;
  driver_name: string | null;
}

export interface TourStay {
  id: string;
  property_id: string | null;
  description: string;
  nights: number;
  property_type: string | null;
  room_category: string | null;
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
  tour_type: TourType | null;
  child_price: string | null;
  infant_price: string | null;
  tax_rate: string | null;
  service_charge_rate: string | null;
  deposit_percentage: string | null;
  payment_deadline_days: number | null;
  cancellation_policy: string | null;
  refund_policy: string | null;
  child_policy: string | null;
  emergency_contact_phone: string | null;
  weather_risk_note: string | null;
  activity_risk_note: string | null;
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
  tour_type: TourType | null;
  images: TourImage[];
}
