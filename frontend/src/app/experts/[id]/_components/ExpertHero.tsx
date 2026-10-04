import { BadgeCheck, CalendarCheck, Flag, Languages, MapPin, ShieldAlert, ShieldCheck, Sparkles, Star } from "lucide-react";
import Link from "next/link";

import { MessageButton } from "@/components/shared/MessageButton";
import { buttonVariants } from "@/components/ui/Button";
import { plural } from "@/lib/format";
import { apiFileUrl } from "@/lib/media";
import type { PublicLocalExpertProfile } from "@/types/profile";

export function ExpertHero({ expert, onReport }: { expert: PublicLocalExpertProfile; onReport: () => void }) {
  const photo = apiFileUrl(expert.photo_url);
  const rating = expert.rating_avg ? Number(expert.rating_avg) : null;
  const since = expert.member_since ? new Date(expert.member_since).getFullYear() : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="h-28 bg-gradient-to-r from-primary-600 via-indigo-600 to-accent-500 sm:h-36" />
      <div className="px-5 pb-6 sm:px-8">
        <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={expert.name} className="h-28 w-28 rounded-3xl object-cover shadow-lg ring-4 ring-white sm:h-32 sm:w-32 dark:ring-zinc-900" />
            ) : (
              <span className="flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-500 to-indigo-600 text-4xl font-bold text-white shadow-lg ring-4 ring-white sm:h-32 sm:w-32 dark:ring-zinc-900">
                {expert.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MessageButton contextType="expert" contextId={expert.partner_role_id} label="Message" variant="primary" size="md" signInFallback />
            <Link href="/custom-requests" className={buttonVariants({ variant: "secondary", size: "md" })}>
              <Sparkles className="h-4 w-4" /> Request a custom trip
            </Link>
            <button
              type="button"
              onClick={onReport}
              title="Report this profile"
              aria-label="Report this profile"
              className="rounded-full p-2.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            >
              <Flag className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{expert.name}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-200 dark:bg-primary-950/50 dark:text-primary-300 dark:ring-primary-900">
              <BadgeCheck className="h-3.5 w-3.5" /> Local Expert
            </span>
          </div>
          {expert.headline && <p className="mt-1 text-lg text-zinc-600 dark:text-zinc-400">{expert.headline}</p>}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {rating !== null ? (
              <a href="#reviews" className="inline-flex items-center gap-1 font-semibold text-zinc-900 hover:underline dark:text-zinc-100">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {rating.toFixed(1)}
                <span className="font-normal text-zinc-500">({plural(expert.reviews_count, "review")})</span>
              </a>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-accent-500" /> New on Ovigo
              </span>
            )}
            {expert.primary_destination && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" /> Based in {expert.primary_destination}
              </span>
            )}
            {expert.languages && expert.languages.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Languages className="h-4 w-4" /> {expert.languages.join(", ")}
              </span>
            )}
            {since && (
              <span className="inline-flex items-center gap-1">
                <CalendarCheck className="h-4 w-4" /> On Ovigo since {since}
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">
              <ShieldCheck className="h-3.5 w-3.5" /> Approved by Ovigo
            </span>
            {expert.identity_verified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">
                <BadgeCheck className="h-3.5 w-3.5" /> Identity verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <ShieldAlert className="h-3.5 w-3.5" /> ID verification pending
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
