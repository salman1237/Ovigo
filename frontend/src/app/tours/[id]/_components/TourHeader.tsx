"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Clock, Compass, MapPin, Sparkles, Star, Users } from "lucide-react";
import Link from "next/link";

import { TrustBadges } from "@/components/shared/TrustBadges";
import { apiClient } from "@/lib/api-client";
import type { LocationTag } from "@/types/location";
import type { Review } from "@/types/review";
import { TOUR_TYPE_LABELS, type Departure, type Tour } from "@/types/tour";

import { IconBadge, Pill, DetailSection } from "@/components/shared/DetailSection";
import { formatDay, paragraphs, plural } from "@/lib/format";
import { durationLabel } from "./tour-utils";

export function useTourLocations(tourId: string) {
  return useQuery({
    queryKey: ["tour-locations", tourId],
    queryFn: () => apiClient.get<LocationTag[]>(`/api/v1/tours/${tourId}/locations`),
  });
}

export function useTourReviews(tourId: string) {
  return useQuery({
    queryKey: ["reviews", "tour", tourId],
    queryFn: () => apiClient.get<Review[]>(`/api/v1/reviews?tour_id=${tourId}`),
  });
}

/** Breadcrumb, badges, title, summary and rating line. */
export function TourTitle({ tour }: { tour: Tour }) {
  const { data: locations } = useTourLocations(tour.id);
  const { data: reviews } = useTourReviews(tour.id);
  const where = (locations ?? []).map((l) => l.location);
  const primary = where.find((l) => l.id === tour.primary_destination_id) ?? where[0];
  const avg = reviews && reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-zinc-500">
        <Link href="/tours" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Tours
        </Link>
        {primary && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/destinations/${primary.slug}`} className="hover:text-zinc-900 dark:hover:text-zinc-100">
              {primary.name}
            </Link>
          </>
        )}
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {tour.tour_type && <Pill tone="accent">{TOUR_TYPE_LABELS[tour.tour_type]}</Pill>}
        <TrustBadges entityType="tour" entityId={tour.id} />
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">{tour.title}</h1>
      {tour.short_summary && <p className="mt-2 max-w-3xl text-base text-zinc-600 sm:text-lg dark:text-zinc-400">{tour.short_summary}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {avg !== null ? (
          <a href="#reviews" className="inline-flex items-center gap-1 font-medium text-zinc-900 hover:underline dark:text-zinc-100">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {avg.toFixed(1)}
            <span className="font-normal text-zinc-500">({plural(reviews!.length, "review")})</span>
          </a>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-4 w-4 text-accent-500" /> New tour
          </span>
        )}
        {primary && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" /> {primary.name}
          </span>
        )}
      </div>
    </div>
  );
}

/** The at-a-glance facts strip under the gallery. */
export function KeyFacts({ tour, nextDeparture }: { tour: Tour; nextDeparture: Departure | null }) {
  const group =
    tour.min_group_size && tour.min_group_size > 1 ? `${tour.min_group_size}–${tour.max_group_size} people` : `Up to ${tour.max_group_size} people`;
  const facts: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Clock />, label: "Duration", value: durationLabel(tour) },
    { icon: <Users />, label: "Group size", value: group },
    ...(nextDeparture ? [{ icon: <CalendarClock />, label: "Next departure", value: formatDay(nextDeparture.departure_date) }] : []),
    ...(tour.pickup_location ? [{ icon: <MapPin />, label: "Starts from", value: tour.pickup_location }] : []),
    ...(tour.tour_type ? [{ icon: <Compass />, label: "Style", value: TOUR_TYPE_LABELS[tour.tour_type] }] : []),
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {facts.map((f) => (
        <div key={f.label} className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <IconBadge size="sm">{f.icon}</IconBadge>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{f.label}</dt>
            <dd className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50" title={f.value}>
              {f.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

export function OverviewSection({ tour }: { tour: Tour }) {
  const { data: locations } = useTourLocations(tour.id);
  const places = (locations ?? []).map((l) => l.location);
  const travelerTypes = tour.suitable_traveler_type ?? [];
  return (
    <DetailSection id="overview" title="About this tour" icon={<Sparkles />}>
      <div className="space-y-3 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        {paragraphs(tour.description).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
      {(travelerTypes.length > 0 || places.length > 0) && (
        <div className="mt-5 grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-2 dark:border-zinc-800">
          {travelerTypes.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Great for</p>
              <div className="flex flex-wrap gap-1.5">
                {travelerTypes.map((t) => (
                  <Pill key={t} tone="primary">
                    {t}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {places.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Places you&apos;ll visit</p>
              <div className="flex flex-wrap gap-1.5">
                {places.map((l) => (
                  <Link key={l.id} href={`/destinations/${l.slug}`}>
                    <Pill icon={<MapPin />} className="hover:bg-zinc-200 dark:hover:bg-zinc-700">
                      {l.name}
                    </Pill>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DetailSection>
  );
}
