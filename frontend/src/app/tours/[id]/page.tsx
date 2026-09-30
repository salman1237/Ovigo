"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bus,
  CalendarDays,
  Clock,
  CloudRain,
  Gift,
  Hotel,
  ListTree,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (error || !tour) return <ErrorState message="Tour not found." />;

  const hasInclusions =
    tour.meals.length > 0 || tour.activities.length > 0 || tour.transport.length > 0 || tour.stays.length > 0;
  const hasPolicies =
    tour.cancellation_policy ||
    tour.refund_policy ||
    tour.child_policy ||
    tour.emergency_contact_phone ||
    tour.weather_risk_note ||
    tour.activity_risk_note;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary-50 to-transparent dark:from-primary-950/30" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-10 lg:pb-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {tour.tour_type && <Badge variant="accent">{TOUR_TYPE_LABELS[tour.tour_type]}</Badge>}
                <TrustBadges entityType="tour" entityId={tour.id} />
              </div>
              <h1 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-zinc-50">{tour.title}</h1>
            </div>
            <MessageButton contextType="tour" contextId={tour.id} label="Message this Expert" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              {tour.duration_days} day{tour.duration_days === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              Up to {tour.max_group_size} people
            </span>
            <span className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-50">
              from {formatMoney(tour.base_price)} <ApproxPrice amountBDT={tour.base_price} />
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="overflow-hidden rounded-3xl shadow-elevated"
        >
          <PhotoGallery images={tour.images} urlFor={(img) => tourImageUrl(tour.id, img.id)} alt={tour.title} />
        </motion.div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-6">
            {tour.description && (
              <Section>
                <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{tour.description}</p>
              </Section>
            )}

            {tour.itinerary.length > 0 && (
              <Section title="Itinerary" icon={<ListTree className="h-4 w-4" />}>
                <ol className="flex flex-col">
                  {tour.itinerary.map((day, i) => (
                    <li key={day.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {i < tour.itinerary.length - 1 && (
                        <span className="absolute left-4 top-9 h-[calc(100%-2rem)] w-px bg-zinc-200 dark:bg-zinc-800" />
                      )}
                      <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-indigo-600 text-xs font-semibold text-white shadow-md shadow-primary-600/20">
                        {day.day_number}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">{day.title}</p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                          {day.location_name && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {day.location_name}
                            </span>
                          )}
                          {(day.arrival_time || day.departure_time) && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {day.arrival_time ?? "—"} to {day.departure_time ?? "—"}
                            </span>
                          )}
                        </p>
                        {day.description && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{day.description}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            {tour.departures.length > 0 && (
              <Section title="Upcoming departures" icon={<CalendarDays className="h-4 w-4" />}>
                <div className="flex flex-wrap gap-2.5">
                  {tour.departures.map((d) => {
                    const low = d.available_seats > 0 && d.available_seats <= 3;
                    const full = d.available_seats < 1;
                    return (
                      <div
                        key={d.id}
                        className={`rounded-xl border px-4 py-2.5 text-sm ${
                          full
                            ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40"
                            : "border-primary-200 bg-primary-50 text-zinc-900 dark:border-primary-900 dark:bg-primary-950/30 dark:text-zinc-50"
                        }`}
                      >
                        <p className="font-medium">{d.departure_date}</p>
                        <p className={`mt-0.5 text-xs ${full ? "text-zinc-400" : low ? "font-medium text-accent-600 dark:text-accent-400" : "text-zinc-500"}`}>
                          {full ? "Fully booked" : `${d.available_seats} seat${d.available_seats === 1 ? "" : "s"} left`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {hasInclusions && (
              <Section title="What's included" icon={<Sparkles className="h-4 w-4" />}>
                <div className="grid gap-6 sm:grid-cols-2">
                  {tour.meals.length > 0 && (
                    <InclusionGroup icon={<UtensilsCrossed className="h-4 w-4" />} title="Meals">
                      {tour.meals.map((m) => (
                        <InclusionChip key={m.id}>{m.meal_type}</InclusionChip>
                      ))}
                    </InclusionGroup>
                  )}
                  {tour.activities.length > 0 && (
                    <InclusionGroup icon={<Sparkles className="h-4 w-4" />} title="Activities">
                      {tour.activities.map((a) => (
                        <InclusionChip key={a.id}>
                          {a.name}
                          {a.difficulty && <span className="text-zinc-400"> · {a.difficulty}</span>}
                          {a.duration_hours && <span className="text-zinc-400"> · {a.duration_hours}h</span>}
                        </InclusionChip>
                      ))}
                    </InclusionGroup>
                  )}
                  {tour.transport.length > 0 && (
                    <InclusionGroup icon={<Bus className="h-4 w-4" />} title="Transport">
                      {tour.transport.map((t) => (
                        <InclusionChip key={t.id}>
                          {t.mode}
                          {t.vehicle_type && <span className="text-zinc-400"> · {t.vehicle_type}</span>}
                          {t.has_ac && <span className="text-zinc-400"> · AC</span>}
                        </InclusionChip>
                      ))}
                    </InclusionGroup>
                  )}
                  {tour.stays.length > 0 && (
                    <InclusionGroup icon={<Hotel className="h-4 w-4" />} title="Accommodation">
                      {tour.stays.map((s) => (
                        <InclusionChip key={s.id}>
                          {s.description} · {s.nights} night{s.nights === 1 ? "" : "s"}
                        </InclusionChip>
                      ))}
                    </InclusionGroup>
                  )}
                </div>
                {tour.addons.length > 0 && (
                  <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                      <Gift className="h-3.5 w-3.5" /> Optional add-ons
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {tour.addons.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          {a.name} <span className="text-primary-600 dark:text-primary-400">+{formatMoney(a.price)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {hasPolicies && (
              <Section title="Policies & safety" icon={<ShieldCheck className="h-4 w-4" />}>
                <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {tour.cancellation_policy && (
                    <PolicyRow icon={<CalendarDays className="h-4 w-4" />} label="Cancellation">
                      {tour.cancellation_policy}
                    </PolicyRow>
                  )}
                  {tour.refund_policy && (
                    <PolicyRow icon={<ShieldCheck className="h-4 w-4" />} label="Refund">
                      {tour.refund_policy}
                    </PolicyRow>
                  )}
                  {tour.child_policy && (
                    <PolicyRow icon={<Users className="h-4 w-4" />} label="Children">
                      {tour.child_policy}
                    </PolicyRow>
                  )}
                  {tour.emergency_contact_phone && (
                    <PolicyRow icon={<Phone className="h-4 w-4" />} label="Emergency contact">
                      {tour.emergency_contact_phone}
                    </PolicyRow>
                  )}
                  {tour.weather_risk_note && (
                    <PolicyRow icon={<CloudRain className="h-4 w-4" />} label="Weather">
                      {tour.weather_risk_note}
                    </PolicyRow>
                  )}
                  {tour.activity_risk_note && (
                    <PolicyRow icon={<AlertTriangle className="h-4 w-4" />} label="Activity risk">
                      {tour.activity_risk_note}
                    </PolicyRow>
                  )}
                </div>
              </Section>
            )}

            <Section title="Reviews">
              <ReviewsList tourId={tour.id} />
            </Section>

            <FrequentlyBookedWith endpoint={`/api/v1/tours/${tour.id}/frequently-booked-with`} />
            <SimilarTours tourId={tour.id} />
          </div>

          {tour.departures.length > 0 && (
            <div className="lg:w-80 lg:shrink-0">
              <div id="book-section" className="scroll-mt-24 lg:sticky lg:top-20">
                <BookTourSection tour={tour} />
              </div>
            </div>
          )}
        </div>

        {tour.departures.length > 0 && (
          <MobileBookBar priceLabel={formatMoney(tour.base_price)} priceSuffix="/ person" />
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card variant="elevated">
        {title && (
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {icon && <span className="text-primary-600 dark:text-primary-400">{icon}</span>}
            {title}
          </h2>
        )}
        <div className={title ? "mt-4" : undefined}>{children}</div>
      </Card>
    </motion.div>
  );
}

function InclusionGroup({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
        {icon} {title}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}

function InclusionChip({ children }: { children: React.ReactNode }) {
  return <li className="text-sm capitalize text-zinc-700 dark:text-zinc-300">{children}</li>;
}

function PolicyRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400">{icon}</span>
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{label}: </span>
        {children}
      </p>
    </div>
  );
}

/** Mobile-only fixed CTA bar — on small screens the booking card sits at the
 * bottom of a long page, so this keeps price + a way to book always reachable
 * without requiring a full scroll. Scrolls to the real booking section (which
 * still does the actual booking) rather than duplicating its logic. */
function MobileBookBar({ priceLabel, priceSuffix }: { priceLabel: string; priceSuffix: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {priceLabel} <span className="text-xs font-normal text-zinc-500">{priceSuffix}</span>
      </p>
      <Button
        size="md"
        onClick={() => document.getElementById("book-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        Book now
      </Button>
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
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {formatMoney(price)} <span className="text-sm font-normal text-zinc-500">/ person</span>
      </p>
      <p className="text-xs text-zinc-400">
        <ApproxPrice amountBDT={price} />
      </p>
      {(tour.child_price || tour.infant_price || tour.tax_rate || tour.service_charge_rate || tour.deposit_percentage) && (
        <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-900/40">
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
      <div className="mt-5 flex flex-col gap-3">
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
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
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
