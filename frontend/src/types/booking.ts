export type BookingStatus = "pending_payment" | "confirmed" | "checked_in" | "checked_out" | "completed" | "cancelled";
export type BookingItemType = "tour_departure" | "room_type";
export type BookingItemStatus = "confirmed" | "checked_in" | "checked_out" | "completed" | "cancelled";

export interface BookingItem {
  id: string;
  item_type: BookingItemType;
  status: BookingItemStatus;
  tour_departure_id: string | null;
  room_type_id: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  quantity: number;
  unit_price: string;
  subtotal: string;
  assigned_room_id: string | null;
}

export interface Guest {
  id: string;
  full_name: string;
  age: number | null;
  id_document: string | null;
}

export interface Booking {
  id: string;
  user_id: string;
  status: BookingStatus;
  total_amount: string;
  tax_service_amount: string;
  currency: string;
  created_at: string;
  items: BookingItem[];
  guests: Guest[];
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Pending Payment",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  completed: "Completed",
  cancelled: "Cancelled",
};
