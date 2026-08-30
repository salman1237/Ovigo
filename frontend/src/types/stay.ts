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
