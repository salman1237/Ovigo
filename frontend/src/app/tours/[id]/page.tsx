"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { FrequentlyBookedWith } from "@/components/shared/FrequentlyBookedWith";
import { MessageButton } from "@/components/shared/MessageButton";
import { PhotoGallery } from "@/components/shared/PhotoGallery";
import { ReviewsList } from "@/components/shared/ReviewsList";
import { SimilarTours } from "@/components/shared/SimilarTours";
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
import { tourImageUrl } from "@/lib/media";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import { TOUR_TYPE_LABELS, type Tour } from "@/types/tour";

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
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h1>
        {tour.tour_type && <Badge variant="accent">{TOUR_TYPE_LABELS[tour.tour_type]}</Badge>}
      </div>
      <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
        {tour.duration_days} days · from {formatMoney(tour.base_price)} <ApproxPrice amountBDT={tour.base_price} /> · up to {tour.max_group_size} people
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TrustBadges entityType="tour" entityId={tour.id} />
        <MessageButton contextType="tour" contextId={tour.id} label="Message this Expert" />
      </div>

      <PhotoGallery images={tour.images} urlFor={(img) => tourImageUrl(tour.id, img.id)} alt={tour.title} />

      <div className="mt-8 flex flex-col gap-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          {tour.description && <p className="text-sm text-zinc-700 dark:text-zinc-300">{tour.description}</p>}

          {tour.itinerary.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Itinerary</h2>
              <ol className="mt-2 flex flex-col gap-2">
                {tour.itinerary.map((day) => (
                  <li key={day.id} className="text-sm">
                    <span className="font-medium">Day {day.day_number}: {day.title}</span>
                    {day.location_name && <span className="text-zinc-400"> · {day.location_name}</span>}
                    {(day.arrival_time || day.departure_time) && (
                      <span className="text-zinc-400">
                        {" "}
                        · {day.arrival_time ?? "—"} to {day.departure_time ?? "—"}
                      </span>
                    )}
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
                <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {tour.activities.map((a) => (
                    <li key={a.id}>
                      {a.name}
                      {a.duration_hours && <span className="text-zinc-400"> · {a.duration_hours}h</span>}
                      {a.difficulty && <span className="text-zinc-400"> · {a.difficulty}</span>}
                      {a.min_age != null && <span className="text-zinc-400"> · {a.min_age}+ yrs</span>}
                      {a.guide_required && <span className="text-zinc-400"> · guide required</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tour.transport.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Transport</h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {tour.transport.map((t) => (
                    <li key={t.id}>
                      {t.mode}
                      {t.vehicle_type && <span className="text-zinc-400"> · {t.vehicle_type}</span>}
                      {t.has_ac && <span className="text-zinc-400"> · AC</span>}
                      {t.capacity && <span className="text-zinc-400"> · {t.capacity} seats</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tour.stays.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Stays</h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {tour.stays.map((s) => (
                    <li key={s.id}>
                      {s.description} ({s.nights} nights)
                      {s.property_type && <span className="text-zinc-400"> · {s.property_type}</span>}
                      {s.room_category && <span className="text-zinc-400"> · {s.room_category}</span>}
                    </li>
                  ))}
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

          {(tour.cancellation_policy ||
            tour.refund_policy ||
            tour.child_policy ||
            tour.emergency_contact_phone ||
            tour.weather_risk_note ||
            tour.activity_risk_note) && (
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              {(tour.cancellation_policy || tour.refund_policy || tour.child_policy) && (
                <div>
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Policies</h2>
                  <ul className="mt-2 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {tour.cancellation_policy && (
                      <li>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Cancellation: </span>
                        {tour.cancellation_policy}
                      </li>
                    )}
                    {tour.refund_policy && (
                      <li>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Refund: </span>
                        {tour.refund_policy}
                      </li>
                    )}
                    {tour.child_policy && (
                      <li>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Children: </span>
                        {tour.child_policy}
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {(tour.emergency_contact_phone || tour.weather_risk_note || tour.activity_risk_note) && (
                <div>
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Safety</h2>
                  <ul className="mt-2 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {tour.emergency_contact_phone && (
                      <li>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Emergency contact: </span>
                        {tour.emergency_contact_phone}
                      </li>
                    )}
                    {tour.weather_risk_note && (
                      <li>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Weather: </span>
                        {tour.weather_risk_note}
                      </li>
                    )}
                    {tour.activity_risk_note && (
                      <li>
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">Activity risk: </span>
                        {tour.activity_risk_note}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-10">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Reviews</h2>
            <div className="mt-2">
              <ReviewsList tourId={tour.id} />
            </div>
          </div>

          <FrequentlyBookedWith endpoint={`/api/v1/tours/${tour.id}/frequently-booked-with`} />
          <SimilarTours tourId={tour.id} />
        </div>

        {tour.departures.length > 0 && (
          <div className="lg:w-80 lg:shrink-0">
            <div className="lg:sticky lg:top-20">
              <BookTourSection tour={tour} />
            </div>
          </div>
        )}
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
      <Card variant="elevated">
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
    <Card variant="elevated">
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {formatMoney(price)} <span className="text-sm font-normal text-zinc-500">/ person</span>
      </p>
      <p className="text-xs text-zinc-400">
        <ApproxPrice amountBDT={price} />
      </p>
      {(tour.child_price || tour.infant_price || tour.tax_rate || tour.service_charge_rate || tour.deposit_percentage) && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-500">
          {tour.child_price && <li>Child: {formatMoney(tour.child_price)}</li>}
          {tour.infant_price && <li>Infant: {formatMoney(tour.infant_price)}</li>}
          {tour.tax_rate && <li>+{(Number(tour.tax_rate) * 100).toFixed(0)}% tax</li>}
          {tour.service_charge_rate && <li>+{(Number(tour.service_charge_rate) * 100).toFixed(0)}% service charge</li>}
          {tour.deposit_percentage && (
            <li>
              {(Number(tour.deposit_percentage) * 100).toFixed(0)}% deposit
              {tour.payment_deadline_days ? `, balance due ${tour.payment_deadline_days} days before departure` : ""}
            </li>
          )}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-3">
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
        <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
          <span className="text-zinc-500">Total</span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button
          onClick={book}
          loading={submitting}
          disabled={!departureId || (departure?.available_seats ?? 0) < quantity}
          className="w-full"
        >
          {submitting ? "Redirecting to payment…" : "Book & Pay"}
        </Button>
        <Button
          variant="secondary"
          onClick={addTourToCart}
          disabled={!departureId || (departure?.available_seats ?? 0) < quantity}
          className="w-full"
        >
          Add to cart
        </Button>
        {addedToCart && (
          <Link href="/cart" className="text-center text-sm text-primary-600 underline dark:text-primary-400">
            Added — combine with a stay in your cart →
          </Link>
        )}
      </div>
    </Card>
  );
}
