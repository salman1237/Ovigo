"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { apiClient } from "@/lib/api-client";
import type { Tour } from "@/types/tour";

export default function TourDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: tour, isLoading, error } = useQuery({
    queryKey: ["public-tour", id],
    queryFn: () => apiClient.get<Tour>(`/api/v1/tours/${id}`),
    retry: false,
  });

  if (isLoading) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;
  if (error || !tour) return <p className="px-6 py-12 text-sm text-zinc-400">Tour not found.</p>;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">{tour.duration_days} days · from ${tour.base_price} · up to {tour.max_group_size} people</p>
      {tour.description && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{tour.description}</p>}

      {tour.itinerary.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Itinerary</h2>
          <ol className="mt-2 flex flex-col gap-2">
            {tour.itinerary.map((day) => (
              <li key={day.id} className="text-sm">
                <span className="font-medium">Day {day.day_number}: {day.title}</span>
                {day.description && <p className="text-zinc-500">{day.description}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tour.departures.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Upcoming departures</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {tour.departures.map((d) => (
              <li key={d.id} className="rounded-full border border-zinc-300 px-3 py-1 text-xs dark:border-zinc-700">
                {d.departure_date} — {d.available_seats} seats
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {tour.meals.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Meals</h2>
            <ul className="mt-2 text-sm capitalize text-zinc-600 dark:text-zinc-400">
              {tour.meals.map((m) => <li key={m.id}>{m.meal_type}</li>)}
            </ul>
          </div>
        )}
        {tour.activities.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Activities</h2>
            <ul className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tour.activities.map((a) => <li key={a.id}>{a.name}</li>)}
            </ul>
          </div>
        )}
        {tour.transport.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Transport</h2>
            <ul className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tour.transport.map((t) => <li key={t.id}>{t.mode}</li>)}
            </ul>
          </div>
        )}
        {tour.stays.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Stays</h2>
            <ul className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tour.stays.map((s) => <li key={s.id}>{s.description} ({s.nights} nights)</li>)}
            </ul>
          </div>
        )}
        {tour.addons.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Optional add-ons</h2>
            <ul className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {tour.addons.map((a) => <li key={a.id}>{a.name} — ${a.price}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
