export interface Review {
  id: string;
  booking_item_id: string;
  tour_id: string | null;
  property_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { id: string; full_name: string };
}
