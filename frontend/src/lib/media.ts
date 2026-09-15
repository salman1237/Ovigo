import { API_URL } from "@/lib/constants";

export function tourImageUrl(tourId: string, imageId: string): string {
  return `${API_URL}/api/v1/tours/${tourId}/images/${imageId}/file`;
}

export function propertyImageUrl(propertyId: string, imageId: string): string {
  return `${API_URL}/api/v1/properties/${propertyId}/images/${imageId}/file`;
}

export function firstImageId<T extends { id: string; sort_order: number }>(images: T[]): T | undefined {
  return images.length > 0 ? [...images].sort((a, b) => a.sort_order - b.sort_order)[0] : undefined;
}
