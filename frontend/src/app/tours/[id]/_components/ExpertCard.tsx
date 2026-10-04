import { ArrowRight, BadgeCheck, Clock, Languages, MapPin, MessageCircle, Star } from "lucide-react";
import Link from "next/link";

import { MessageButton } from "@/components/shared/MessageButton";
import { apiFileUrl } from "@/lib/media";
import type { TourExpertCard } from "@/types/tour";

import { Pill } from "@/components/shared/DetailSection";
import { plural, responseTimeLabel } from "@/lib/format";

/** "Your local expert" — who runs this tour, with their real track record and a
 * way to reach them (PRD §10.3 "Responsible Local Expert", §8.2). */
export function ExpertCard({ expert, tourId }: { expert: TourExpertCard; tourId: string }) {
  const photo = apiFileUrl(expert.photo_url);
  const rating = expert.rating_avg ? Number(expert.rating_avg) : null;
  const memberSince = expert.member_since ? new Date(expert.member_since).getFullYear() : null;
  const responds = responseTimeLabel(expert.avg_response_minutes);
  const profileHref = `/experts/${expert.partner_role_id}`;

  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-white via-white to-primary-50/60 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-primary-950/30">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex items-center gap-4 sm:flex-1">
          <div className="relative shrink-0">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={expert.name} className="h-20 w-20 rounded-2xl object-cover shadow-md ring-4 ring-white dark:ring-zinc-900" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-2xl font-bold text-white shadow-md">
                {expert.name.charAt(0)}
              </span>
            )}
            <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-white p-0.5 shadow dark:bg-zinc-900" title="Approved by Ovigo">
              <BadgeCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600 dark:text-primary-400">Your local expert</p>
            <h3 className="truncate text-lg font-bold text-zinc-900 dark:text-zinc-50">{expert.name}</h3>
            {expert.headline && <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{expert.headline}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {rating !== null ? (
                <Pill tone="warning" icon={<Star className="fill-amber-400 text-amber-500" />}>
                  {rating.toFixed(1)} · {plural(expert.reviews_count, "review")}
                </Pill>
              ) : (
                <Pill tone="primary">New on Ovigo</Pill>
              )}
              {expert.identity_verified && (
                <Pill tone="success" icon={<BadgeCheck />}>
                  ID verified
                </Pill>
              )}
              {expert.completed_bookings > 0 && <Pill>{plural(expert.completed_bookings, "trip")} hosted</Pill>}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:w-56">
          {expert.profile_public && (
            <Link
              href={profileHref}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              View full profile <ArrowRight className="h-4 w-4" />
            </Link>
          )}
          <MessageButton contextType="tour" contextId={tourId} label={`Message ${expert.name.split(" ")[0]}`} size="md" signInFallback block />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-200/70 bg-white/60 px-5 py-3 text-xs text-zinc-600 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
        {expert.years_experience ? <span>{plural(expert.years_experience, "year")} guiding</span> : null}
        {expert.primary_destination && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> Based in {expert.primary_destination}
          </span>
        )}
        {expert.languages.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Languages className="h-3.5 w-3.5" /> {expert.languages.join(", ")}
          </span>
        )}
        {responds && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> Usually replies {responds}
          </span>
        )}
        {memberSince && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> On Ovigo since {memberSince}
          </span>
        )}
      </div>
    </div>
  );
}
