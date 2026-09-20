"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { DestinationSummary } from "@/types/search";

/** Destinations ranked by total listing count, richest first — shared by the
 * homepage hero, AuthVisual, and the browse-page hero banners so they all
 * pick photos the same way and share one query-cache entry. */
export function useRankedDestinations(): DestinationSummary[] {
  const { data } = useQuery({
    queryKey: ["home-destinations"],
    queryFn: () => apiClient.get<DestinationSummary[]>("/api/v1/search/destinations"),
  });
  return [...(data ?? [])].sort(
    (a, b) =>
      b.published_tour_count + b.published_property_count + b.published_vehicle_count -
      (a.published_tour_count + a.published_property_count + a.published_vehicle_count)
  );
}
