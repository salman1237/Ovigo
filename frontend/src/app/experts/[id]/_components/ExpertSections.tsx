/** The expert profile's content sections (PRD §8.2). */
import { ArrowRight, Bus, CalendarDays, Clock, Compass, Home, MapPin, Siren, Users } from "lucide-react";
import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { formatDateRange, formatMoney, plural, responseTimeLabel } from "@/lib/format";
import { tourImageUrl } from "@/lib/media";
import type { PublicLocalExpertProfile } from "@/types/profile";
import { TOUR_TYPE_LABELS } from "@/types/tour";

import { Pill, SubCard, DetailSection } from "@/components/shared/DetailSection";

type Expert = PublicLocalExpertProfile;

function Stat({ label, value, hint, accent = false }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className={`text-2xl font-bold tracking-tight ${accent ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-50"}`}>{value}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

/** Real numbers only: anything with no data yet reads "—" with a reason. */
export function TrackRecord({ expert }: { expert: Expert }) {
  const responds = responseTimeLabel(expert.avg_response_minutes);
  return (
    <DetailSection id="track-record" title="Track record" icon={<Compass />} subtitle="From real bookings, reviews and messages on Ovigo" bare>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Tours run" value={String(expert.total_tours_conducted)} hint="Departures with a completed booking" />
        <Stat label="Completed bookings" value={String(expert.completed_bookings)} />
        <Stat
          label="Response rate"
          value={pct(expert.response_rate_percent)}
          hint={responds ? `Usually replies ${responds}` : expert.response_rate_percent === null ? "No messages yet" : undefined}
          accent={(expert.response_rate_percent ?? 0) >= 90}
        />
        <Stat
          label="Completion rate"
          value={pct(expert.completion_rate_percent)}
          hint={expert.completion_rate_percent === null ? "No finished trips yet" : "Paid bookings that went ahead"}
          accent={(expert.completion_rate_percent ?? 0) >= 90}
        />
        <Stat
          label="Cancellation rate"
          value={pct(expert.cancellation_rate_percent)}
          hint={expert.cancellation_rate_percent === null ? "No paid bookings yet" : "Paid bookings later cancelled"}
        />
        <Stat
          label="Rating"
          value={expert.rating_avg ? Number(expert.rating_avg).toFixed(1) : "—"}
          hint={expert.reviews_count ? plural(expert.reviews_count, "verified review") : "No reviews yet"}
        />
      </div>
    </DetailSection>
  );
}

export function AboutSection({ expert }: { expert: Expert }) {
  const places = [expert.primary_destination, ...expert.secondary_destinations].filter(Boolean) as string[];
  if (!expert.bio && places.length === 0 && expert.expertise_categories.length === 0) return null;
  return (
    <DetailSection id="about" title={`About ${expert.name.split(" ")[0]}`} icon={<Users />}>
      {expert.bio && <p className="whitespace-pre-line text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{expert.bio}</p>}
      <div className="mt-5 grid gap-5 border-t border-zinc-100 pt-5 sm:grid-cols-2 dark:border-zinc-800">
        {expert.expertise_categories.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Expertise</p>
            <div className="flex flex-wrap gap-1.5">
              {expert.expertise_categories.map((c) => (
                <Pill key={c} tone="primary">
                  {c}
                </Pill>
              ))}
            </div>
          </div>
        )}
        {places.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Operates in</p>
            <div className="flex flex-wrap gap-1.5">
              {places.map((p, i) => (
                <Pill key={p} icon={<MapPin />} tone={i === 0 && expert.primary_destination ? "primary" : "neutral"}>
                  {p}
                </Pill>
              ))}
            </div>
          </div>
        )}
        {expert.years_experience ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Experience</p>
            <p className="text-sm text-zinc-800 dark:text-zinc-200">{plural(expert.years_experience, "year")} guiding locally</p>
          </div>
        ) : null}
        {expert.emergency_handling_capability && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Emergencies</p>
            <p className="flex items-center gap-1.5 text-sm text-zinc-800 dark:text-zinc-200">
              <Siren className="h-4 w-4 text-red-500" /> Trained to handle emergencies <span className="text-xs text-zinc-400">(self-reported)</span>
            </p>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

export function UpcomingSection({ expert }: { expert: Expert }) {
  return (
    <DetailSection id="upcoming" title="Upcoming departures" icon={<CalendarDays />} subtitle="Fixed dates you can book now" bare>
      <div className="space-y-2.5">
        {expert.upcoming_departures.map((d) => (
          <Link
            key={d.departure_id}
            href={`/tours/${d.tour_id}#book`}
            className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 transition hover:border-primary-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="min-w-0">
              <p className="font-semibold text-zinc-900 group-hover:text-primary-600 dark:text-zinc-50">{d.tour_title}</p>
              <p className="flex items-center gap-1 text-sm text-zinc-500">
                <Clock className="h-3.5 w-3.5" /> {formatDateRange(d.departure_date, d.return_date)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Pill tone={d.available_seats <= 3 ? "warning" : "success"}>{plural(d.available_seats, "seat")} left</Pill>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(d.price)}</span>
              <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-primary-600" />
            </div>
          </Link>
        ))}
      </div>
    </DetailSection>
  );
}

export function ToursSection({ expert }: { expert: Expert }) {
  return (
    <DetailSection id="tours" title="Tours" icon={<Compass />} subtitle={`${plural(expert.tours.length, "tour")} by ${expert.name}`} bare>
      <div className="grid gap-5 sm:grid-cols-2">
        {expert.tours.map((tour) => {
          const cover = [...tour.images].sort((a, b) => a.sort_order - b.sort_order)[0];
          return (
            <Link
              key={tour.id}
              href={`/tours/${tour.id}`}
              className="group overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-primary-500 to-indigo-600">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tourImageUrl(tour.id, cover.id)} alt={tour.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                {tour.tour_type && (
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-zinc-800 shadow">
                    {TOUR_TYPE_LABELS[tour.tour_type]}
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="line-clamp-2 font-semibold text-zinc-900 group-hover:text-primary-600 dark:text-zinc-50">{tour.title}</h3>
                {tour.short_summary && <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{tour.short_summary}</p>}
                <div className="mt-3 flex items-end justify-between gap-2">
                  <span className="text-xs text-zinc-500">
                    {plural(tour.duration_days, "day")}
                    {tour.pickup_location ? ` · from ${tour.pickup_location}` : ""}
                  </span>
                  <span className="text-right">
                    <span className="block text-xs text-zinc-400">from</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(tour.base_price)}</span>
                    <ApproxPrice amountBDT={tour.base_price} className="block text-[11px] text-zinc-400" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </DetailSection>
  );
}

/** Associated Guides, properties and transport services (PRD §8.2). */
export function NetworkSection({ expert }: { expert: Expert }) {
  if (expert.guides.length + expert.properties.length + expert.transport.length === 0) return null;
  return (
    <DetailSection id="network" title="Works with" icon={<Users />} subtitle="The guides, stays and transport behind these trips" bare>
      <div className="grid gap-4 md:grid-cols-3">
        {expert.guides.length > 0 && (
          <SubCard>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <Users className="h-3.5 w-3.5" /> Guides
            </p>
            <ul className="space-y-2">
              {expert.guides.map((g) => (
                <li key={g.guide_role_id} className="flex items-center gap-2.5 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                    {g.name.charAt(0)}
                  </span>
                  {g.has_public_profile ? (
                    <Link href={`/guides/${g.guide_role_id}`} className="font-medium text-zinc-900 hover:text-primary-600 dark:text-zinc-50">
                      {g.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{g.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </SubCard>
        )}
        {expert.properties.length > 0 && (
          <SubCard>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <Home className="h-3.5 w-3.5" /> Stays
            </p>
            <ul className="space-y-2">
              {expert.properties.map((p) => (
                <li key={p.property_id} className="text-sm">
                  <Link href={`/stays/${p.property_id}`} className="font-medium text-zinc-900 hover:text-primary-600 dark:text-zinc-50">
                    {p.name}
                  </Link>
                  <span className="block text-xs capitalize text-zinc-500">{p.property_type.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          </SubCard>
        )}
        {expert.transport.length > 0 && (
          <SubCard>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <Bus className="h-3.5 w-3.5" /> Transport
            </p>
            <ul className="space-y-2">
              {expert.transport.map((t) => (
                <li key={`${t.mode}-${t.provider_name}-${t.vehicle_type}`} className="text-sm">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{t.mode}</span>
                  {(t.provider_name || t.vehicle_type) && (
                    <span className="block text-xs text-zinc-500">{[t.provider_name, t.vehicle_type].filter(Boolean).join(" · ")}</span>
                  )}
                </li>
              ))}
            </ul>
          </SubCard>
        )}
      </div>
    </DetailSection>
  );
}
