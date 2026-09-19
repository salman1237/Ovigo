import { API_URL } from "@/lib/constants";
import type { DestinationSummary } from "@/types/search";

export function tourImageUrl(tourId: string, imageId: string): string {
  return `${API_URL}/api/v1/tours/${tourId}/images/${imageId}/file`;
}

export function propertyImageUrl(propertyId: string, imageId: string): string {
  return `${API_URL}/api/v1/properties/${propertyId}/images/${imageId}/file`;
}

/** Tour cover preferred over property, matching the backend's own preference
 * order in search/service.py::get_destinations. Null if the destination has
 * neither (shouldn't happen for anything returned by that endpoint, but a
 * destination with only vehicles tagged — vehicles have no photos — would). */
export function destinationCoverUrl(dest: DestinationSummary): string | null {
  if (dest.cover_tour_id && dest.cover_tour_image_id) {
    return tourImageUrl(dest.cover_tour_id, dest.cover_tour_image_id);
  }
  if (dest.cover_property_id && dest.cover_property_image_id) {
    return propertyImageUrl(dest.cover_property_id, dest.cover_property_image_id);
  }
  return null;
}

export function firstImageId<T extends { id: string; sort_order: number }>(images: T[]): T | undefined {
  return images.length > 0 ? [...images].sort((a, b) => a.sort_order - b.sort_order)[0] : undefined;
}
