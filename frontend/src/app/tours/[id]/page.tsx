"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import Link from "next/link";

import { MessageButton } from "@/components/shared/MessageButton";
import { ReviewsList } from "@/components/shared/ReviewsList";
import { TrustBadges } from "@/components/shared/TrustBadges";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import type { Tour } from "@/types/tour";

export default function TourDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: tour, isLoading, error } = useQuery({
    queryKey: ["public-tour", id],
    queryFn: () => apiClient.get<Tour>(`/api/v1/tours/${id}`),
    retry: false,
  });

  if (isLoading) return <Spinner />;
  if (error || !tour) return <ErrorState message="Tour not found." />;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h1>
      <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
        {tour.duration_days} days · from {formatMoney(tour.base_price)} · up to {tour.max_group_size} people
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TrustBadges entityType="tour" entityId={tour.id} />
        <MessageButton contextType="tour" contextId={tour.id} label="Message this Expert" />
      </div>
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
              <li key={d.id}>
                <Badge variant="primary">
                  {d.departure_date} — {d.available_seats} seats
                </Badge>
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
              {tour.addons.map((a) => <li key={a.id}>{a.name} — {formatMoney(a.price)}</li>)}
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
  const addToCart = useCartStore((s) => s.addItem);
  const [departureId, setDepartureId] = useState(tour.departures[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const departure = tour.departures.find((d) => d.id === departureId);
  const price = departure?.price_override ?? tour.base_price;
  const total = (Number(price) * quantity).toFixed(2);

  const addTourToCart = () => {
    if (!departure) return;
    addToCart({
      key: `tour-${departureId}-${Date.now()}`,
      item_type: "tour_departure",
      title: tour.title,
      subtitle: `Departs ${departure.departure_date} · ${quantity} traveler(s)`,
      unit_price: price,
      quantity,
      tour_departure_id: departureId,
    });
    setAddedToCart(true);
  };

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
      <Card className="mt-10">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to book this tour.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Book this tour</h2>
      <div className="mt-3 flex flex-col gap-3">
        <Select label="Departure date" value={departureId} onChange={(e) => setDepartureId(e.target.value)}>
          {tour.departures.map((d) => (
            <option key={d.id} value={d.id} disabled={d.available_seats < 1}>
              {d.departure_date} — {d.available_seats} seat(s) left
            </option>
          ))}
        </Select>
        <Input
          type="number"
          label="Number of travelers"
          min={1}
          max={departure?.available_seats ?? 1}
          value={quantity}
          onChange={(e) => setGuestCount(Number(e.target.value))}
          className="w-32"
        />
        <div className="flex flex-col gap-2">
          {guestNames.map((name, i) => (
            <Input
              key={i}
              value={name}
              onChange={(e) => setGuestNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
              placeholder={`Traveler ${i + 1} full name`}
            />
          ))}
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={book}
            loading={submitting}
            disabled={!departureId || (departure?.available_seats ?? 0) < quantity}
          >
            {submitting ? "Redirecting to payment…" : "Book & Pay"}
          </Button>
          <Button
            variant="secondary"
            onClick={addTourToCart}
            disabled={!departureId || (departure?.available_seats ?? 0) < quantity}
          >
            Add to cart
          </Button>
          {addedToCart && (
            <Link href="/cart" className="text-sm text-primary-600 underline dark:text-primary-400">
              Added — combine with a stay in your cart →
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
