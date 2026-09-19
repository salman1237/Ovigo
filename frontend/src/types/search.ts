export interface DestinationSummary {
  id: string;
  name: string;
  slug: string;
  type: string;
  published_tour_count: number;
  published_property_count: number;
  published_vehicle_count: number;
  cover_tour_id: string | null;
  cover_tour_image_id: string | null;
  cover_property_id: string | null;
  cover_property_image_id: string | null;
}
