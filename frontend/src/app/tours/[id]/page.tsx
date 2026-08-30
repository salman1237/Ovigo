"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ReviewsList } from "@/components/shared/ReviewsList";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { Booking } from "@/types/booking";
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

      {tour.departures.length > 0 && <BookTourSection tour={tour} />}

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Reviews</h2>
        <div className="mt-2">
          <ReviewsList tourId={tour.id} />
        </div>
      </div>
    </div>
  );
}

function BookTourSection({ tour }: { tour: Tour }) {
  const user = useAuthStore((s) => s.user);
  const [departureId, setDepartureId] = useState(tour.departures[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const departure = tour.departures.find((d) => d.id === departureId);
  const price = departure?.price_override ?? tour.base_price;
  const total = (Number(price) * quantity).toFixed(2);

  const setGuestCount = (n: number) => {
    setQuantity(n);
    setGuestNames((prev) => {
      const next = [...prev];
      while (next.length < n) next.push("");
      return next.slice(0, n);
    });
  };

  const book = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const booking = await apiClient.post<Booking>(
        "/api/v1/bookings",
        {
          items: [{ item_type: "tour_departure", tour_departure_id: departureId, quantity }],
          guests: guestNames.filter((n) => n.trim()).map((full_name) => ({ full_name })),
        },
        { auth: true }
      );
      const payment = await apiClient.post<{ gateway_page_url: string }>(
        "/api/v1/payments/initiate",
        { booking_id: booking.id },
        { auth: true }
      );
      window.location.href = payment.gateway_page_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start booking");
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="mt-10 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <a href="/account/login" className="font-medium underline">Sign in</a> to book this tour.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Book this tour</h2>
      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Departure date</label>
          <select
            value={departureId}
            onChange={(e) => setDepartureId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {tour.departures.map((d) => (
              <option key={d.id} value={d.id} disabled={d.available_seats < 1}>
                {d.departure_date} — {d.available_seats} seat(s) left
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Number of travelers</label>
          <input
            type="number"
            min={1}
            max={departure?.available_seats ?? 1}
            value={quantity}
            onChange={(e) => setGuestCount(Number(e.target.value))}
            className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-2">
          {guestNames.map((name, i) => (
            <input
              key={i}
              value={name}
              onChange={(e) => setGuestNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
              placeholder={`Traveler ${i + 1} full name`}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          ))}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">${total}</span></p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={book}
          disabled={submitting || !departureId || (departure?.available_seats ?? 0) < quantity}
          className="self-start rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {submitting ? "Redirecting to payment…" : "Book & Pay"}
        </button>
      </div>
    </div>
  );
}
