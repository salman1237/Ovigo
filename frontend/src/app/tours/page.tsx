"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import type { TourSummary } from "@/types/tour";

export default function ToursSearchPage() {
  const [locationSlug, setLocationSlug] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: tours, isLoading } = useQuery({
    queryKey: ["tours-search", searchTerm],
    queryFn: () =>
      apiClient.get<TourSummary[]>(`/api/v1/tours${searchTerm ? `?location_slug=${searchTerm}` : ""}`),
  });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Explore Tours</h1>
      <p className="mt-1 text-sm text-zinc-500">Search fixed-date tours by destination.</p>

      <form
        onSubmit={(e) => { e.preventDefault(); setSearchTerm(locationSlug); }}
        className="mt-6 flex gap-2"
      >
        <input
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          placeholder="Destination slug, e.g. bangladesh, coxs-bazar"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
          Search
        </button>
      </form>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (tours ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No tours found.</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(tours ?? []).map((tour) => (
          <Link
            key={tour.id}
            href={`/tours/${tour.id}`}
            className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
            <p className="mt-1 text-sm text-zinc-500">{tour.duration_days} days · from ${tour.base_price}</p>
            {tour.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{tour.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
