import { Bike, Bus, Car, CarFront, Caravan, Truck } from "lucide-react";

import type { VehicleType } from "@/types/rentcar";

/** Vehicles deliberately have no photo gallery (see rentcar/models.py's module
 * docstring — a scope trim, not an oversight) — this fills that gap with a
 * per-type illustration instead of a blank thumbnail (Phase 6 redesign,
 * Sprint 37-38). */
export const VEHICLE_TYPE_ICONS: Record<VehicleType, typeof Car> = {
  sedan: Car,
  suv: CarFront,
  van: Caravan,
  microbus: Bus,
  motorcycle: Bike,
  pickup: Truck,
};
