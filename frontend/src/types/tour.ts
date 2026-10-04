export type TourStatus =
  | "draft"
  | "submitted_for_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "booking_open"
  | "almost_full"
  | "sold_out"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "suspended"
  | "archived"
  | "pending_review"
  | "published"
  | "rejected";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type TourType =
  | "fixed_departure"
  | "private"
  | "group"
  | "ground"
  | "day"
  | "multi_day"
  | "experience"
  | "family"
  | "couple"
  | "adventure"
  | "food"
  | "photography"
  | "cultural"
  | "corporate"
  | "romantic"
  | "wildlife"
  | "beach"
  | "trekking"
  | "city"
  | "cruise"
  | "religious";

export const TOUR_TYPE_LABELS: Record<TourType, string> = {
  fixed_departure: "Fixed Departure",
  private: "Private Tour",
  group: "Group Tour",
  ground: "Ground Tour",
  day: "Day Tour",
  multi_day: "Multi-Day Tour",
  experience: "Local Experience",
  family: "Family Tour",
  couple: "Couple Tour",
  adventure: "Adventure",
  food: "Food & Culinary",
  photography: "Photography",
  cultural: "Cultural & Heritage",
  corporate: "Corporate Retreat",
  romantic: "Romantic",
  wildlife: "Wildlife & Nature",
  beach: "Beach & Coastal",
  trekking: "Trekking & Hiking",
  city: "City Tour",
  cruise: "Cruise & River",
  religious: "Pilgrimage / Religious",
};

export interface ItineraryDay {
  id: string;
  day_number: number;
  title: string;
  description: string | null;
  location_name: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  activity_summary?: string | null;
  entry_fee_included?: boolean;
  accessibility_notes?: string | null;
  safety_notes?: string | null;
}

export interface Departure {
  id: string;
  departure_date: string;
  return_date?: string | null;
  departure_time?: string | null;
  return_time?: string | null;
  booking_deadline?: string | null;
  min_participants?: number | null;
  max_participants?: number | null;
  available_seats: number;
  confirmation_threshold?: number | null;
  price_override: string | null;
  status: string;
  recurrence_rule?: string | null;
  assigned_guide_role_id?: string | null;
}

export interface Meal {
  id: string;
  day_number?: number | null;
  meal_type: MealType;
  description: string | null;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_halal?: boolean;
  allergy_notes?: string | null;
  children_menu_available?: boolean;
  restaurant_provider?: string | null;
  optional_upgrade_price?: string | null;
}

export interface Activity {
  id: string;
  day_number?: number | null;
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
  weather_dependency?: string | null;
  addon_price?: string | null;
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
  provider_name?: string | null;
  vehicle_type: string | null;
  vehicle_model?: string | null;
  driver_included?: boolean;
  has_ac: boolean | null;
  capacity: number | null;
  driver_name: string | null;
  intercity_details?: string | null;
  local_details?: string | null;
  pickup_location?: string | null;
  pickup_time?: string | null;
  dropoff_location?: string | null;
  dropoff_time?: string | null;
  route_info?: string | null;
  luggage_policy?: string | null;
}

export interface TourStay {
  id: string;
  property_id: string | null;
  stay_name?: string | null;
  description: string;
  nights: number;
  property_type: string | null;
  room_category: string | null;
  occupancy_arrangement?: string | null;
  room_sharing_policy?: string | null;
  check_in_out_info?: string | null;
  stay_location?: string | null;
  stay_photos?: string[] | null;
  source_type?: string | null;
}

export interface TourImage {
  id: string;
  file_name: string;
  sort_order: number;
}

/** Who runs a tour — the public tour page's "Your local expert" card. Numbers are
 * computed from real bookings, reviews and chats; null means "nothing yet". */
export interface TourExpertCard {
  partner_role_id: string;
  name: string;
  headline: string | null;
  /** API-relative; prefix with the API origin (see lib/media.ts::apiFileUrl). */
  photo_url: string | null;
  years_experience: number | null;
  languages: string[];
  primary_destination: string | null;
  profile_public: boolean;
  identity_verified: boolean;
  member_since: string | null;
  rating_avg: string | null;
  reviews_count: number;
  completed_bookings: number;
  response_rate_percent: number | null;
  avg_response_minutes: number | null;
}

export interface Tour {
  id: string;
  local_expert_role_id: string;
  title: string;
  slug: string;
  description: string | null;
  short_summary?: string | null;
  duration_days: number;
  duration_nights?: number | null;
  base_price: string;
  min_group_size?: number | null;
  max_group_size: number;
  status: TourStatus;
  rejection_reason: string | null;
  created_at: string;
  tour_type: TourType | null;
  suitable_traveler_type?: string[] | null;
  primary_destination_id?: string | null;

  // Pricing
  child_price: string | null;
  infant_price: string | null;
  price_per_group?: string | null;
  single_room_supplement?: string | null;
  couple_price?: string | null;
  seasonal_pricing?: Record<string, unknown> | null;
  weekend_price?: string | null;
  early_bird_discount?: string | null;
  group_discount?: string | null;
  currency: string;
  tax_rate: string | null;
  service_charge_rate: string | null;
  deposit_percentage: string | null;
  payment_deadline_days: number | null;
  included_services?: string[] | null;
  excluded_services?: string[] | null;

  // Pickup & Dropoff
  pickup_location?: string | null;
  pickup_time?: string | null;
  dropoff_location?: string | null;
  dropoff_time?: string | null;
  pickup_coordinates?: Record<string, unknown> | null;
  pickup_window?: string | null;
  pickup_contact_person?: string | null;
  home_hotel_pickup_available?: boolean;
  home_pickup_extra_charge?: string | null;
  late_arrival_policy?: string | null;

  // Safety & Security
  nearest_hospital?: string | null;
  first_aid_available?: boolean;
  women_safety_notes?: string | null;
  child_safety_notes?: string | null;
  night_travel_policy?: string | null;
  permit_requirements?: string | null;
  insurance_included?: boolean;
  emergency_procedure?: string | null;
  emergency_contact_phone: string | null;
  weather_risk_note: string | null;
  activity_risk_note: string | null;

  // Policies
  cancellation_policy: string | null;
  refund_policy: string | null;
  child_policy: string | null;
  rescheduling_policy?: string | null;
  min_participant_policy?: string | null;
  bad_weather_policy?: string | null;
  no_show_policy?: string | null;
  pet_policy?: string | null;
  accessibility_policy?: string | null;
  traveler_conduct_policy?: string | null;

  images: TourImage[];
  itinerary: ItineraryDay[];
  departures: Departure[];
  meals: Meal[];
  activities: Activity[];
  addons: Addon[];
  transport: Transport[];
  stays: TourStay[];
  /** Only on the public GET /api/v1/tours/{id}. */
  expert?: TourExpertCard | null;
}

export interface TourSummary {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  short_summary?: string | null;
  duration_days: number;
  duration_nights?: number | null;
  base_price: string;
  currency?: string;
  status: TourStatus;
  tour_type: TourType | null;
  pickup_location?: string | null;
  images: TourImage[];
}

export interface DepartureTraveler {
  booking_id: string;
  booking_item_id: string;
  traveler_name: string;
  traveler_email: string;
  traveler_phone?: string | null;
  seats: number;
  status: string;
  booked_at: string;
}
