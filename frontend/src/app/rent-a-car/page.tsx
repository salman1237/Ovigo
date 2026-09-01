"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_LABELS, type Vehicle } from "@/types/rentcar";

export default function RentACarSearchPage() {
  const [locationSlug, setLocationSlug] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["vehicles-search", searchTerm],
    queryFn: () =>
      apiClient.get<Vehicle[]>(`/api/v1/vehicles${searchTerm ? `?location_slug=${searchTerm}` : ""}`),
  });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Rent a Car</h1>
      <p className="mt-1 text-sm text-zinc-500">Browse vehicles by destination.</p>

      <form
        onSubmit={(e) => { e.preventDefault(); setSearchTerm(locationSlug); }}
        className="mt-6 flex gap-2"
      >
        <input
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          placeholder="Destination slug, e.g. dhaka, coxs-bazar"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
          Search
        </button>
      </form>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (vehicles ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No vehicles found.</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(vehicles ?? []).map((v) => (
          <Link
            key={v.id}
            href={`/rent-a-car/${v.id}`}
            className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{v.make} {v.model} ({v.year})</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {VEHICLE_TYPE_LABELS[v.vehicle_type]} · {v.seats} seats · {formatMoney(v.price_per_day)}/day
              {v.with_driver && " · with driver"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
