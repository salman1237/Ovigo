"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { TourSummary } from "@/types/tour";

export default function ToursSearchPage() {
  const [locationSlug, setLocationSlug] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: tours, isLoading, isError } = useQuery({
    queryKey: ["tours-search", searchTerm],
    queryFn: () =>
      apiClient.get<TourSummary[]>(`/api/v1/tours${searchTerm ? `?location_slug=${searchTerm}` : ""}`),
  });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Explore Tours</h1>
      <p className="mt-1 text-sm text-zinc-500">Search fixed-date tours by destination.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchTerm(locationSlug);
        }}
        className="mt-6 flex flex-col gap-2 sm:flex-row"
      >
        <Input
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          placeholder="Destination slug, e.g. bangladesh, coxs-bazar"
          className="flex-1"
        />
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {isLoading && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Couldn't load tours right now. Please try again." />}
      {!isLoading && !isError && (tours ?? []).length === 0 && (
        <EmptyState icon={MapPin} title="No tours found" description="Try a different destination or clear your search." />
      )}

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(tours ?? []).map((tour, i) => (
          <motion.div
            key={tour.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          >
            <Link href={`/tours/${tour.id}`}>
              <Card hoverable className="flex h-full flex-col">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
                <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                  {tour.duration_days} days · from {formatMoney(tour.base_price)}
                </p>
                {tour.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{tour.description}</p>}
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
