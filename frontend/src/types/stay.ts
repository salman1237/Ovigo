export type PropertyType = "hotel" | "resort" | "homestay" | "guesthouse";
export type PropertyStatus = "draft" | "pending_review" | "published" | "rejected";
export type AmenityKey =
  | "wifi"
  | "pool"
  | "parking"
  | "ac"
  | "breakfast_included"
  | "pet_friendly"
  | "airport_pickup"
  | "tv"
  | "hot_water"
  | "kitchen";

export const AMENITY_LABELS: Record<AmenityKey, string> = {
  wifi: "WiFi",
  pool: "Pool",
  parking: "Parking",
  ac: "AC",
  breakfast_included: "Breakfast Included",
  pet_friendly: "Pet Friendly",
  airport_pickup: "Airport Pickup",
  tv: "TV",
  hot_water: "Hot Water",
  kitchen: "Kitchen",
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  hotel: "Hotel",
  resort: "Resort",
  homestay: "Homestay",
  guesthouse: "Guesthouse",
};

export interface RoomType {
  id: string;
  name: string;
  description: string | null;
  max_occupancy: number;
  base_price: string;
  total_units: number;
  min_stay_nights: number | null;
}

export type RatePlanType = "seasonal" | "weekend" | "corporate" | "group" | "early_bird";
export type RatePlanAdjustmentType = "percentage" | "fixed_price";

export const RATE_PLAN_TYPE_LABELS: Record<RatePlanType, string> = {
  seasonal: "Seasonal",
  weekend: "Weekend",
  corporate: "Corporate",
  group: "Group",
  early_bird: "Early Bird",
};

export interface RatePlan {
  id: string;
  room_type_id: string;
  name: string;
  rate_type: RatePlanType;
  adjustment_type: RatePlanAdjustmentType;
  adjustment_value: string;
  start_date: string | null;
  end_date: string | null;
  applies_to_weekends: boolean;
  min_days_before_checkin: number | null;
  min_quantity: number | null;
  is_active: boolean;
  created_at: string;
}

export interface PropertyImage {
  id: string;
  file_name: string;
  sort_order: number;
}

export interface Property {
  id: string;
  host_role_id: string;
  name: string;
  slug: string;
  description: string | null;
  property_type: PropertyType;
  status: PropertyStatus;
  rejection_reason: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  cancellation_policy: string | null;
  house_rules: string | null;
  children_allowed: boolean;
  pets_allowed: boolean;
  tax_rate: string | null;
  service_charge_rate: string | null;
  created_at: string;
  room_types: RoomType[];
  amenities: { amenity: AmenityKey }[];
  images: PropertyImage[];
}

export interface PropertySummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  property_type: PropertyType;
  status: PropertyStatus;
}

export type StaffRole = "manager" | "front_desk" | "housekeeping";
export type StaffStatus = "pending" | "active" | "revoked";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  manager: "Manager",
  front_desk: "Front Desk",
  housekeeping: "Housekeeping",
};

export interface Staff {
  id: string;
  property_id: string;
  user_id: string;
  staff_role: StaffRole;
  status: StaffStatus;
  created_at: string;
  responded_at: string | null;
  staff_name: string;
  staff_email: string;
  property_name: string;
}

export type HousekeepingStatus = "clean" | "dirty" | "cleaning_in_progress" | "out_of_order";

export const HOUSEKEEPING_STATUS_LABELS: Record<HousekeepingStatus, string> = {
  clean: "Clean",
  dirty: "Dirty",
  cleaning_in_progress: "Cleaning in Progress",
  out_of_order: "Out of Order",
};

export interface Room {
  id: string;
  room_type_id: string;
  room_number: string;
  housekeeping_status: HousekeepingStatus;
  notes: string | null;
  created_at: string;
}

export interface IcalToken {
  ical_token: string;
  feed_path: string;
}
