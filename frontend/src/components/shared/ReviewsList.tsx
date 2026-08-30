"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import type { Review } from "@/types/review";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}
      <span className="text-zinc-300 dark:text-zinc-700">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function ReviewsList({ tourId, propertyId }: { tourId?: string; propertyId?: string }) {
  const qs = tourId ? `tour_id=${tourId}` : `property_id=${propertyId}`;
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["reviews", tourId ?? propertyId],
    queryFn: () => apiClient.get<Review[]>(`/api/v1/reviews?${qs}`),
  });

  if (isLoading) return null;
  if (!reviews || reviews.length === 0) {
    return <p className="text-sm text-zinc-400">No reviews yet.</p>;
  }

  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <Stars rating={Math.round(avg)} /> {avg.toFixed(1)} ({reviews.length} review{reviews.length === 1 ? "" : "s"})
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {reviews.map((r) => (
          <div key={r.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{r.reviewer.full_name}</span>
              <Stars rating={r.rating} />
            </div>
            {r.comment && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
