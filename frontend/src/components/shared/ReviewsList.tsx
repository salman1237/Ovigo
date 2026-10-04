"use client";

import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { apiClient } from "@/lib/api-client";
import type { Review } from "@/types/review";

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= rating ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200 dark:fill-zinc-700 dark:text-zinc-700"}`} />
      ))}
    </span>
  );
}

function reviewsQuery({ tourId, propertyId, expertRoleId }: { tourId?: string; propertyId?: string; expertRoleId?: string }) {
  if (tourId) return { key: ["reviews", "tour", tourId], qs: `tour_id=${tourId}` };
  if (expertRoleId) return { key: ["reviews", "expert", expertRoleId], qs: `expert_role_id=${expertRoleId}` };
  return { key: ["reviews", "property", propertyId], qs: `property_id=${propertyId}` };
}

/** Verified traveler reviews (only travelers with a completed booking can post
 * one) with an average and a 5→1 breakdown. `listingTitles` labels each review
 * with the tour it's about, for an expert-wide list. */
export function ReviewsList({
  tourId,
  propertyId,
  expertRoleId,
  listingTitles,
}: {
  tourId?: string;
  propertyId?: string;
  expertRoleId?: string;
  listingTitles?: Record<string, string>;
}) {
  const { key, qs } = reviewsQuery({ tourId, propertyId, expertRoleId });
  const { data: reviews, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiClient.get<Review[]>(`/api/v1/reviews?${qs}`),
  });

  if (isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />;
  if (!reviews || reviews.length === 0) {
    return (
      <p className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500 dark:bg-zinc-800/40">
        No reviews yet. Reviews come only from travelers who completed a booking.
      </p>
    );
  }

  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const counts = [5, 4, 3, 2, 1].map((star) => [star, reviews.filter((r) => r.rating === star).length] as const);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="text-center sm:w-36">
          <p className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">{avg.toFixed(1)}</p>
          <Stars rating={Math.round(avg)} size="md" />
          <p className="mt-1 text-xs text-zinc-500">
            {reviews.length} verified review{reviews.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex-1 space-y-1.5">
          {counts.map(([star, count]) => (
            <div key={star} className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-3 text-right tabular-nums">{star}</span>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(count / reviews.length) * 100}%` }} />
              </div>
              <span className="w-6 tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-sm font-semibold text-white">
                {r.reviewer.full_name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{r.reviewer.full_name}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(r.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  {r.tour_id && listingTitles?.[r.tour_id] ? ` · ${listingTitles[r.tour_id]}` : ""}
                </p>
              </div>
              <Stars rating={r.rating} />
            </div>
            {r.comment && <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
