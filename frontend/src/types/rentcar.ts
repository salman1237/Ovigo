export type VehicleType = "sedan" | "suv" | "van" | "microbus" | "motorcycle" | "pickup";
export type TransmissionType = "manual" | "automatic";
export type VehicleStatus = "draft" | "pending_review" | "published" | "rejected";

export interface Driver {
  id: string;
  full_name: string;
  license_number: string;
  phone: string | null;
  is_available: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string;
  rent_a_car_role_id: string;
  make: string;
  model: string;
  year: number;
  vehicle_type: VehicleType;
  transmission: TransmissionType;
  seats: number;
  price_per_day: string;
  with_driver: boolean;
  assigned_driver_id: string | null;
  description: string | null;
  status: VehicleStatus;
  rejection_reason: string | null;
  created_at: string;
}

export interface VehicleAvailability {
  date: string;
  is_available: boolean;
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sedan: "Sedan",
  suv: "SUV",
  van: "Van",
  microbus: "Microbus",
  motorcycle: "Motorcycle",
  pickup: "Pickup",
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  published: "Published",
  rejected: "Rejected",
};
