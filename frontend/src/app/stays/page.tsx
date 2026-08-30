"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import { PROPERTY_TYPE_LABELS, type Property } from "@/types/stay";

export default function StaysSearchPage() {
  const [locationSlug, setLocationSlug] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [params, setParams] = useState<{ slug: string; checkIn: string; checkOut: string; guests: number } | null>(null);

  const { data: stays, isLoading } = useQuery({
    queryKey: ["stays-search", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.slug) qs.set("location_slug", params.slug);
      if (params?.checkIn) qs.set("check_in", params.checkIn);
      if (params?.checkOut) qs.set("check_out", params.checkOut);
      qs.set("guests", String(params?.guests ?? 1));
      return apiClient.get<Property[]>(`/api/v1/search/stays?${qs.toString()}`);
    },
    enabled: params !== null,
  });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Explore Stays</h1>
      <p className="mt-1 text-sm text-zinc-500">Search hotels, resorts, homestays and guesthouses by destination and dates.</p>

      <form
        onSubmit={(e) => { e.preventDefault(); setParams({ slug: locationSlug, checkIn, checkOut, guests }); }}
        className="mt-6 flex flex-wrap items-end gap-2"
      >
        <input
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          placeholder="Destination slug"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <input type="number" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-20 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <button type="submit" className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
          Search
        </button>
      </form>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {params && !isLoading && (stays ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No stays found for these dates.</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(stays ?? []).map((prop) => (
          <Link
            key={prop.id}
            href={`/stays/${prop.id}`}
            className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{prop.name}</h3>
            <p className="mt-1 text-sm text-zinc-500">{PROPERTY_TYPE_LABELS[prop.property_type]}</p>
            {prop.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{prop.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
