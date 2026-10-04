"use client";

import { useQuery } from "@tanstack/react-query";
import { Award, CalendarDays, Clock, Compass, Languages, MapPin } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import { GUIDE_CERTIFICATION_LABELS, type PublicGuideDetail, packageDuration } from "@/types/guides";

const HORIZON_DAYS = 60;

// Side effects kept outside the component, for the React Compiler's purity rules.
function goToPayment(url: string): void {
  window.location.assign(url);
}

function newCartKey(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function prettyDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function GuideDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: guide, isLoading, isError, error } = useQuery({
    queryKey: ["guides-public", id],
    queryFn: () => apiClient.get<PublicGuideDetail>(`/api/v1/guides/public/${id}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (isError || !guide) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <ErrorState message={notFound ? "This guide isn't taking bookings on Ovigo right now." : "Couldn't load this guide."} />
        <Link href="/guides" className="mt-4 inline-block text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
          ← All guides
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <Link href="/guides" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
        ← All guides
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-2xl font-semibold text-white">
              {guide.full_name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{guide.full_name}</h1>
              {guide.headline && <p className="mt-1 text-zinc-600 dark:text-zinc-400">{guide.headline}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                {guide.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {guide.city}
                  </span>
                )}
                {guide.languages.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Languages className="h-4 w-4" /> {guide.languages.join(", ")}
                  </span>
                )}
                {guide.years_experience !== null && (
                  <span className="flex items-center gap-1">
                    <Compass className="h-4 w-4" /> {guide.years_experience} yr{guide.years_experience === 1 ? "" : "s"} guiding
                  </span>
                )}
                {guide.certification_level !== "none" && (
                  <span className="flex items-center gap-1">
                    <Award className="h-4 w-4" /> {GUIDE_CERTIFICATION_LABELS[guide.certification_level]} certified
                  </span>
                )}
              </div>
            </div>
          </div>

          {guide.bio && (
            <Card variant="elevated">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">About</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-zinc-700 dark:text-zinc-300">{guide.bio}</p>
              {guide.completed_assignments > 0 && (
                <p className="mt-3 text-xs text-zinc-500">
                  Has guided {guide.completed_assignments} tour departure{guide.completed_assignments === 1 ? "" : "s"} for
                  Local Experts on Ovigo.
                </p>
              )}
            </Card>
          )}
        </div>

        <div id="book-section">
          <BookGuideSection guide={guide} />
        </div>
      </div>
    </div>
  );
}

function BookGuideSection({ guide }: { guide: PublicGuideDetail }) {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addItem);
  const [packageId, setPackageId] = useState(guide.packages[0]?.id ?? "");
  const [day, setDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [added, setAdded] = useState(false);

  const { data: openDates, isLoading: datesLoading } = useQuery({
    queryKey: ["guides-public", guide.guide_role_id, "open-dates"],
    queryFn: () =>
      apiClient.get<{ dates: string[] }>(
        `/api/v1/guides/public/${guide.guide_role_id}/open-dates?start=${isoDay(0)}&end=${isoDay(HORIZON_DAYS)}`
      ),
  });

  const pkg = guide.packages.find((p) => p.id === packageId);
  const ready = !!pkg && !!day;

  const book = async () => {
    if (!pkg || !day) return;
    setError(null);
    setSubmitting(true);
    try {
      const booking = await apiClient.post<Booking>(
        "/api/v1/bookings",
        { items: [{ item_type: "guide_service", guide_package_id: pkg.id, check_in_date: day, quantity: 1 }], guests: [] },
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

  const addGuideToCart = () => {
    if (!pkg || !day) return;
    addToCart({
      key: newCartKey(`guide-${pkg.id}-${day}`),
      item_type: "guide_service",
      title: `${guide.full_name} — ${pkg.name}`,
      subtitle: prettyDay(day),
      unit_price: pkg.price,
      quantity: 1,
      guide_package_id: pkg.id,
      check_in_date: day,
    });
    setAdded(true);
  };

  return (
    <Card variant="elevated" className="lg:sticky lg:top-24">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Choose a package</h2>
      <div className="mt-3 flex flex-col gap-2">
        {guide.packages.map((p) => (
          <label
            key={p.id}
            className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors ${
              p.id === packageId
                ? "border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/40"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800"
            }`}
          >
            <span className="flex items-start gap-2">
              <input
                type="radio"
                name="guide-package"
                className="mt-1"
                checked={p.id === packageId}
                onChange={() => setPackageId(p.id)}
              />
              <span>
                <span className="block font-medium text-zinc-900 dark:text-zinc-50">{p.name}</span>
                {(packageDuration(p) || p.description) && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                    {packageDuration(p) && <Clock className="h-3 w-3" />}
                    {[packageDuration(p), p.description].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-50">
              {formatMoney(p.price)}
              <ApproxPrice amountBDT={p.price} className="block text-right" />
            </span>
          </label>
        ))}
      </div>

      <h2 className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        <CalendarDays className="h-4 w-4" /> Pick a date
      </h2>
      {datesLoading && <Skeleton className="mt-3 h-16 rounded-xl" />}
      {openDates && openDates.dates.length === 0 && (
        <p className="mt-2 text-sm text-zinc-500">No open dates in the next {HORIZON_DAYS} days. Check back soon.</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(openDates?.dates ?? []).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              d === day
                ? "border-primary-500 bg-primary-600 text-white"
                : "border-zinc-200 text-zinc-700 hover:border-primary-300 dark:border-zinc-700 dark:text-zinc-300"
            }`}
          >
            {prettyDay(d)}
          </button>
        ))}
      </div>

      {ready && (
        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
          <span className="text-zinc-500">
            {pkg.name} · {prettyDay(day)}
          </span>
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(pkg.price)}</span>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {user ? (
        <BookButtons ready={ready} submitting={submitting} added={added} onBook={book} onAddToCart={addGuideToCart} />
      ) : (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to book this guide.
        </p>
      )}
      {guide.certification_level === "level_2" && (
        <Badge variant="success" className="mt-4">
          Certified for high-risk activities
        </Badge>
      )}
    </Card>
  );
}

function BookButtons({
  ready,
  submitting,
  added,
  onBook,
  onAddToCart,
}: {
  ready: boolean;
  submitting: boolean;
  added: boolean;
  onBook: () => void;
  onAddToCart: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2">
      <Button onClick={onBook} loading={submitting} disabled={!ready} className="w-full">
        {submitting ? "Redirecting to payment…" : "Book & Pay"}
      </Button>
      <Button variant="secondary" onClick={onAddToCart} disabled={!ready} className="w-full">
        Add to cart
      </Button>
      {added && (
        <Link href="/cart" className="text-center text-sm text-primary-600 underline dark:text-primary-400">
          Added to cart →
        </Link>
      )}
    </div>
  );
}
