/** Pure, tour-specific helpers for the public tour page: derived views of a Tour
 * (departures, prices, meals by day…). Generic date/number formatting lives in
 * lib/format.ts. */
import { parseIsoDate, plural } from "@/lib/format";
import type { Activity, Departure, Meal, Tour } from "@/types/tour";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar date of itinerary day `dayNumber` on a given departure. */
export function visitDate(departure: Departure, dayNumber: number): string {
  return new Date(parseIsoDate(departure.departure_date).getTime() + (dayNumber - 1) * DAY_MS).toISOString().slice(0, 10);
}

export type DepartureAvailability = "open" | "few_left" | "sold_out" | "closed";

export function departureAvailability(dep: Departure, today: string, now: number): DepartureAvailability {
  if (dep.available_seats < 1) return "sold_out";
  if (dep.booking_deadline && new Date(dep.booking_deadline).getTime() < now) return "closed";
  if (dep.departure_date < today) return "closed";
  return dep.available_seats <= 3 ? "few_left" : "open";
}

/** Departures a traveler can still see: not in the past, not cancelled or completed. */
export function upcomingDepartures(tour: Tour, today: string): Departure[] {
  return [...tour.departures]
    .filter((d) => d.departure_date >= today && !["cancelled", "completed"].includes(d.status))
    .sort((a, b) => a.departure_date.localeCompare(b.departure_date));
}

export function departurePrice(tour: Tour, dep?: Departure | null): string {
  return dep?.price_override ?? tour.base_price;
}

export function lowestUpcomingPrice(tour: Tour, departures: Departure[]): string {
  const prices = departures.map((d) => Number(departurePrice(tour, d)));
  return prices.length ? String(Math.min(...prices)) : tour.base_price;
}

export function durationLabel(tour: Pick<Tour, "duration_days" | "duration_nights">): string {
  const nights = tour.duration_nights ?? 0;
  return nights > 0 ? `${plural(tour.duration_days, "day")} · ${plural(nights, "night")}` : plural(tour.duration_days, "day");
}

export function groupByDay<T extends Meal | Activity>(items: T[]): Map<number | null, T[]> {
  const map = new Map<number | null, T[]>();
  for (const item of items) {
    const key = item.day_number ?? null;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

export const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

export function sortMeals(meals: Meal[]): Meal[] {
  return [...meals].sort(
    (a, b) => (a.day_number ?? 99) - (b.day_number ?? 99) || (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
  );
}

export function pickupCoordinates(tour: Tour): { lat: number; lng: number } | null {
  const c = tour.pickup_coordinates as { lat?: unknown; lng?: unknown } | null | undefined;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  return c && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

