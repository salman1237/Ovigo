"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { TourSummary } from "@/types/tour";

export function SimilarTours({ tourId }: { tourId: string }) {
  const { data: tours } = useQuery({
    queryKey: ["similar-tours", tourId],
    queryFn: () => apiClient.get<TourSummary[]>(`/api/v1/tours/${tourId}/similar`),
  });

  if (!tours || tours.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Similar tours</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tours.map((tour) => (
          <Link key={tour.id} href={`/tours/${tour.id}`}>
            <Card hoverable className="flex h-full flex-col p-3">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{tour.title}</p>
              <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                {tour.duration_days} days · from {formatMoney(tour.base_price)} <ApproxPrice amountBDT={tour.base_price} />
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
