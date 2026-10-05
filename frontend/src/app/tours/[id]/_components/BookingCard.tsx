"use client";

import { CalendarDays, Clock, Info, Minus, Plus, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getAdClickCampaignId } from "@/lib/ad-attribution";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatDateRange, formatDay, formatMoney, todayIso } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import type { Departure, Tour } from "@/types/tour";

import { departureAvailability, departurePrice } from "./tour-utils";

// Side effects outside render, for the React Compiler's purity rules.
function nowMs(): number {
  return Date.now();
}
function newCartKey(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
function goToPayment(url: string): void {
  window.location.assign(url);
}

const AVAILABILITY_LABEL = {
  open: (seats: number) => `${seats} seats left`,
  few_left: (seats: number) => `Only ${seats} left`,
  sold_out: () => "Sold out",
  closed: () => "Booking closed",
};

/** Counter row: label, sub-label (price), count, +/- buttons. */
function TravelerRow({
  label,
  sublabel,
  count,
  min,
  max,
  onChange,
}: {
  label: string;
  sublabel: string;
  count: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-400">{sublabel}</p>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-zinc-200 p-1 dark:border-zinc-700">
        <button
          type="button"
          aria-label={`Fewer ${label}`}
          onClick={() => onChange(count - 1)}
          disabled={count <= min}
          className="rounded-full p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{count}</span>
        <button
          type="button"
          aria-label={`More ${label}`}
          onClick={() => onChange(count + 1)}
          disabled={count >= max}
          className="rounded-full p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function BookingCard({
  tour,
  departures,
  selected,
  onSelect,
}: {
  tour: Tour;
  departures: Departure[];
  selected: Departure | null;
  onSelect: (id: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const addToCart = useCartStore((s) => s.addItem);

  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const today = todayIso();
  const now = nowMs();
  const adultPrice = departurePrice(tour, selected);
  const childPrice = tour.child_price ?? null;
  const infantPrice = tour.infant_price ?? null;
  const depositPct = tour.deposit_percentage ? Number(tour.deposit_percentage) : null;

  const hasTiered = childPrice !== null || infantPrice !== null;
  const totalPax = adults + children + infants;

  const computedSubtotal =
    adults * Number(adultPrice) +
    children * (childPrice ? Number(childPrice) : Number(adultPrice)) +
    infants * (infantPrice ? Number(infantPrice) : 0);
  const totalStr = computedSubtotal.toFixed(2);

  const depositAmount = depositPct !== null ? ((computedSubtotal * depositPct) / 100).toFixed(2) : null;

  const selectedState = selected ? departureAvailability(selected, today, now) : null;
  const maxSeats = selected ? Math.max(1, selected.available_seats) : 1;
  const maxAdults = Math.min(maxSeats, tour.max_group_size);
  const bookable = !!selected && (selectedState === "open" || selectedState === "few_left") && totalPax <= selected.available_seats && adults >= 1;

  const syncNames = (a: number, c: number, i: number) => {
    const n = a + c + i;
    setGuestNames((prev) => Array.from({ length: n }, (_, idx) => prev[idx] ?? ""));
  };

  const setAdultsCount = (n: number) => {
    const next = Math.min(Math.max(1, n), maxAdults);
    setAdults(next);
    syncNames(next, children, infants);
  };
  const setChildrenCount = (n: number) => {
    const next = Math.min(Math.max(0, n), maxSeats - adults - infants);
    setChildren(next);
    syncNames(adults, next, infants);
  };
  const setInfantsCount = (n: number) => {
    const next = Math.min(Math.max(0, n), maxSeats - adults - children);
    setInfants(next);
    syncNames(adults, children, next);
  };

  const book = async () => {
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      const booking = await apiClient.post<Booking>(
        "/api/v1/bookings",
        {
          items: [
            {
              item_type: "tour_departure",
              tour_departure_id: selected.id,
              ...(hasTiered ? { adults, children, infants } : { quantity: adults }),
            },
          ],
          guests: guestNames.filter((n) => n.trim()).map((full_name) => ({ full_name })),
          ad_campaign_id: getAdClickCampaignId(),
        },
        { auth: true }
      );
      const payment = await apiClient.post<{ gateway_page_url: string }>(
        "/api/v1/payments/initiate",
        { booking_id: booking.id },
        { auth: true }
      );
      goToPayment(payment.gateway_page_url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start booking");
      setSubmitting(false);
    }
  };

  const addTourToCart = () => {
    if (!selected) return;
    addToCart({
      key: newCartKey(`tour-${selected.id}`),
      item_type: "tour_departure",
      title: tour.title,
      subtitle: `${formatDateRange(selected.departure_date, selected.return_date)} · ${totalPax} traveler(s)`,
      unit_price: adultPrice,
      quantity: hasTiered ? adults : adults,
      tour_departure_id: selected.id,
    });
    setAddedToCart(true);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-elevated dark:border-zinc-800 dark:bg-zinc-900">
      <div className="bg-gradient-to-br from-primary-600 to-indigo-600 px-5 py-4 text-white">
        <p className="text-xs font-medium uppercase tracking-wider text-white/70">{selected ? "Price" : "From"}</p>
        <p className="text-2xl font-bold">
          {formatMoney(adultPrice)} <span className="text-sm font-normal text-white/80">/ adult</span>
        </p>
        {childPrice && (
          <p className="text-xs text-white/70">
            Child {formatMoney(childPrice)}{infantPrice ? ` · Infant ${formatMoney(infantPrice)}` : ""}
          </p>
        )}
        <ApproxPrice amountBDT={adultPrice} className="text-xs text-white/70" />
      </div>

      <div className="space-y-4 p-5">
        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <CalendarDays className="h-3.5 w-3.5" /> Choose a departure
          </legend>
          {departures.length === 0 ? (
            <p className="rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-500 dark:bg-zinc-800/50">
              No upcoming departures right now. Message the expert to ask about new dates.
            </p>
          ) : (
            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-0.5">
              {departures.map((dep) => {
                const state = departureAvailability(dep, today, now);
                const disabled = state === "sold_out" || state === "closed";
                const active = selected?.id === dep.id;
                return (
                  <label
                    key={dep.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors",
                      active
                        ? "border-primary-500 bg-primary-50/70 ring-1 ring-primary-500 dark:border-primary-500 dark:bg-primary-950/40"
                        : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700",
                      disabled && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="radio"
                      name="departure"
                      className="mt-1 accent-primary-600"
                      checked={active}
                      disabled={disabled}
                      onChange={() => {
                        onSelect(dep.id);
                        setAdults(Math.min(adults, dep.available_seats));
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {formatDateRange(dep.departure_date, dep.return_date)}
                      </span>
                      {(dep.departure_time || dep.return_time) && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          <Clock className="h-3 w-3" />
                          {[dep.departure_time && `Departs ${dep.departure_time}`, dep.return_time && `back ${dep.return_time}`].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      <span className={cn("text-xs", state === "few_left" ? "font-semibold text-accent-600 dark:text-accent-400" : "text-zinc-500")}>
                        {AVAILABILITY_LABEL[state](dep.available_seats)}
                        {dep.booking_deadline && state !== "closed" && state !== "sold_out" && ` · book by ${formatDay(dep.booking_deadline.slice(0, 10), { weekday: undefined })}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(departurePrice(tour, dep))}</span>
                  </label>
                );
              })}
            </div>
          )}
          {selected?.confirmation_threshold ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-zinc-500">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Goes ahead once {selected.confirmation_threshold} travelers have booked.
            </p>
          ) : null}
        </fieldset>

        {departures.length > 0 && (
          <div className="space-y-2 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Travelers</p>
            <TravelerRow
              label="Adults"
              sublabel={formatMoney(adultPrice)}
              count={adults}
              min={1}
              max={maxAdults}
              onChange={setAdultsCount}
            />
            {childPrice !== null && (
              <TravelerRow
                label="Children"
                sublabel={`${formatMoney(childPrice)} · under 12`}
                count={children}
                min={0}
                max={maxSeats - adults - infants}
                onChange={setChildrenCount}
              />
            )}
            {infantPrice !== null && (
              <TravelerRow
                label="Infants"
                sublabel={infantPrice === "0" || infantPrice === "0.00" ? "Free · under 2" : `${formatMoney(infantPrice)} · under 2`}
                count={infants}
                min={0}
                max={maxSeats - adults - children}
                onChange={setInfantsCount}
              />
            )}
          </div>
        )}

        {user && departures.length > 0 && (
          <div className="space-y-2">
            {guestNames.map((name, i) => (
              <Input
                key={i}
                value={name}
                onChange={(e) => setGuestNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                placeholder={`Traveler ${i + 1} full name`}
                aria-label={`Traveler ${i + 1} full name`}
              />
            ))}
          </div>
        )}

        {departures.length > 0 && (
          <div className="space-y-1 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Total ({totalPax} traveler{totalPax !== 1 ? "s" : ""})</span>
              <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(totalStr)}</span>
            </div>
            {depositAmount !== null && (
              <div className="flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Pay <strong>{formatMoney(depositAmount)}</strong> deposit now ({tour.deposit_percentage}% of total).
                  {tour.payment_deadline_days ? ` Full balance due ${tour.payment_deadline_days} days before departure.` : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {departures.length > 0 &&
          (user ? (
            <div className="space-y-2">
              <Button onClick={book} loading={submitting} disabled={!bookable} className="w-full" size="lg">
                {submitting ? "Redirecting to payment…" : "Book & pay"}
              </Button>
              <Button variant="secondary" onClick={addTourToCart} disabled={!bookable} className="w-full">
                Add to cart
              </Button>
              {addedToCart && (
                <Link href="/cart" className="block text-center text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                  Added — combine with a stay in your cart →
                </Link>
              )}
            </div>
          ) : (
            <Link
              href={`/account/login?next=${encodeURIComponent(pathname)}`}
              className="flex h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-primary-600 to-indigo-600 text-base font-semibold text-white shadow-md shadow-primary-600/20 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Sign in to book
            </Link>
          ))}

        <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Secure checkout · your expert is paid after the trip
        </p>
      </div>
    </div>
  );
}

/** Mobile-only bar: price plus a jump to the booking card further down the page. */
export function MobileBookBar({ price }: { price: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        <span className="text-xs font-normal text-zinc-500">from </span>
        {formatMoney(price)} <span className="text-xs font-normal text-zinc-500">/ person</span>
      </p>
      <Button size="md" onClick={() => document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        Check dates
      </Button>
    </div>
  );
}
