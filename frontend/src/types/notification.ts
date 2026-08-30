export type NotificationType =
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_completed"
  | "payment_failed"
  | "role_approved"
  | "role_rejected"
  | "document_verified"
  | "document_rejected"
  | "listing_approved"
  | "listing_rejected"
  | "new_review"
  | "dispute_opened"
  | "dispute_resolved";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
