import { create } from "zustand";
import { persist } from "zustand/middleware";

/** A pending line item for the multi-service booking cart — lets a traveler combine
 * a tour departure and a stay into one checkout (technical document Phase 2 Sprint
 * 14-15 "multi-service unified bookings"). The backend has always supported this
 * (Booking already holds multiple BookingItems), so this is purely a frontend
 * concern: collect items across separate tour/stay detail pages, then POST them
 * together from /cart. Mirrors the shape of BookingItemCreate plus enough display
 * fields to render the cart without refetching each listing. */
export interface CartItem {
  key: string;
  item_type: "tour_departure" | "room_type" | "vehicle_rental";
  title: string;
  subtitle: string;
  unit_price: string;
  quantity: number;
  /** Nights/days, only meaningful for room_type and vehicle_rental items — a
   * tour_departure's total is just unit_price * quantity, but a date-range item's
   * is unit_price * quantity * nights. */
  nights?: number;
  tour_departure_id?: string;
  room_type_id?: string;
  vehicle_id?: string;
  check_in_date?: string;
  check_out_date?: string;
}

export function cartItemTotal(item: CartItem): number {
  return Number(item.unit_price) * item.quantity * (item.nights ?? 1);
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((s) => ({ items: [...s.items, item] })),
      removeItem: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: "ovigo-cart" }
  )
);
