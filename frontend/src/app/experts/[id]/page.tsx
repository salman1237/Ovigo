"use client";

import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { DetailSection } from "@/components/shared/DetailSection";
import { ReviewsList } from "@/components/shared/ReviewsList";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import type { PublicLocalExpertProfile } from "@/types/profile";

import { ExpertHero } from "./_components/ExpertHero";
import { AboutSection, NetworkSection, ToursSection, TrackRecord, UpcomingSection } from "./_components/ExpertSections";
import { ReportDialog } from "./_components/ReportDialog";

/** Local Expert public profile (PRD §8.2). */
export default function ExpertPublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [reporting, setReporting] = useState(false);
  const { data: expert, isLoading, error } = useQuery({
    queryKey: ["public-expert", id],
    queryFn: () => apiClient.get<PublicLocalExpertProfile>(`/api/v1/partners/profiles/expert/${id}/public`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
        <Skeleton className="h-72 rounded-3xl" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error || !expert) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{missing ? "This profile isn't public" : "Couldn't load this profile"}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {missing ? "The expert hasn't published their profile yet, or the link is wrong." : "Please try again in a moment."}
        </p>
        <Link href="/tours" className="mt-6 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Browse tours →
        </Link>
      </div>
    );
  }

  const titles = Object.fromEntries(expert.tours.map((t) => [t.id, t.title]));

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary-50/80 to-transparent dark:from-primary-950/30" />
      <div className="mx-auto w-full max-w-5xl space-y-12 px-4 pb-16 pt-8 sm:px-6">
        <ExpertHero expert={expert} onReport={() => setReporting(true)} />
        <TrackRecord expert={expert} />
        <AboutSection expert={expert} />
        {expert.upcoming_departures.length > 0 && <UpcomingSection expert={expert} />}
        {expert.tours.length > 0 && <ToursSection expert={expert} />}
        <NetworkSection expert={expert} />
        <DetailSection id="reviews" title="Traveler reviews" icon={<Star />} subtitle="Across all of this expert's tours">
          <ReviewsList expertRoleId={expert.partner_role_id} listingTitles={titles} />
        </DetailSection>
      </div>
      {reporting && <ReportDialog expertRoleId={expert.partner_role_id} onClose={() => setReporting(false)} />}
    </div>
  );
}
