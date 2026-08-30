import { BookingStatus } from "@/types/booking";

export type PaymentStatus = "initiated" | "validated" | "failed" | "cancelled";
export type PaymentProvider = "sslcommerz";

export interface AdminUserSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface AdminBooking {
  id: string;
  status: BookingStatus;
  total_amount: string;
  currency: string;
  created_at: string;
  traveler: AdminUserSummary;
  item_count: number;
}

export interface AdminPayment {
  id: string;
  booking_id: string;
  provider: PaymentProvider;
  tran_id: string;
  val_id: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  created_at: string;
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  initiated: "Initiated",
  validated: "Validated",
  failed: "Failed",
  cancelled: "Cancelled",
};
