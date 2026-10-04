"use client";

import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { FrequentlyBookedWith } from "@/components/shared/FrequentlyBookedWith";
import { ReviewsList } from "@/components/shared/ReviewsList";
import { SimilarTours } from "@/components/shared/SimilarTours";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import type { Tour } from "@/types/tour";

import { BookingCard, MobileBookBar } from "./_components/BookingCard";
import { ExpertCard } from "./_components/ExpertCard";
import { ActivitiesSection, FoodSection, StaysSection, TransportSection } from "./_components/ExperienceSections";
import { ItinerarySection } from "./_components/ItinerarySection";
import { hasSafetyInfo, MeetingPointSection, SafetySection } from "./_components/LogisticsSections";
import { DetailSection } from "@/components/shared/DetailSection";
import { SectionNav, type NavItem } from "./_components/SectionNav";
import { ExtrasSection, IncludedSection, policyEntries, PoliciesSection, PricingSection } from "./_components/TermsSections";
import { KeyFacts, OverviewSection, TourTitle } from "./_components/TourHeader";
import { TourGallery } from "./_components/TourGallery";
import { todayIso } from "@/lib/format";
import { departureAvailability, lowestUpcomingPrice, upcomingDepartures } from "./_components/tour-utils";

function nowMs(): number {
  return Date.now();
}

export default function TourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tour, isLoading, error } = useQuery({
    queryKey: ["public-tour", id],
    queryFn: () => apiClient.get<Tour>(`/api/v1/tours/${id}`),
    retry: false,
  });

  if (isLoading) return <TourSkeleton />;
  if (error || !tour) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{missing ? "This tour isn't available" : "Couldn't load this tour"}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {missing ? "It may have been unpublished or the link is wrong." : "Please try again in a moment."}
        </p>
        <Link href="/tours" className="mt-6 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Browse all tours →
        </Link>
      </div>
    );
  }
  return <TourDetail tour={tour} />;
}

function TourDetail({ tour }: { tour: Tour }) {
  const departures = useMemo(() => upcomingDepartures(tour, todayIso()), [tour]);
  const firstBookable = departures.find((d) => ["open", "few_left"].includes(departureAvailability(d, todayIso(), nowMs())));
  const [selectedId, setSelectedId] = useState<string | null>(firstBookable?.id ?? null);
  const selected = departures.find((d) => d.id === selectedId) ?? null;

  const has = {
    itinerary: tour.itinerary.length > 0,
    included: (tour.included_services?.length ?? 0) + (tour.excluded_services?.length ?? 0) > 0,
    stays: tour.stays.length > 0,
    food: tour.meals.length > 0,
    activities: tour.activities.length > 0,
    transport: tour.transport.length > 0,
    meeting: Boolean(tour.pickup_location || tour.dropoff_location),
    safety: hasSafetyInfo(tour),
    extras: tour.addons.length > 0,
    policies: policyEntries(tour).length > 0,
  };
  const nav: NavItem[] = [
    { id: "overview", label: "Overview" },
    ...(has.itinerary ? [{ id: "itinerary", label: "Itinerary" }] : []),
    ...(has.included ? [{ id: "included", label: "Included" }] : []),
    ...(has.stays ? [{ id: "stays", label: "Stays" }] : []),
    ...(has.food ? [{ id: "food", label: "Food" }] : []),
    ...(has.activities ? [{ id: "activities", label: "Activities" }] : []),
    ...(has.transport ? [{ id: "transport", label: "Transport" }] : []),
    ...(has.meeting ? [{ id: "meeting", label: "Meeting point" }] : []),
    ...(has.safety ? [{ id: "safety", label: "Safety" }] : []),
    { id: "pricing", label: "Prices" },
    ...(has.policies ? [{ id: "policies", label: "Policies" }] : []),
    { id: "reviews", label: "Reviews" },
  ];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-gradient-to-b from-primary-50/80 via-white to-transparent dark:from-primary-950/30 dark:via-zinc-950" />
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-16">
        <TourTitle tour={tour} />
        <div className="mt-5">
          <TourGallery tourId={tour.id} title={tour.title} images={tour.images} />
        </div>
        <div className="mt-5">
          <KeyFacts tour={tour} nextDeparture={departures[0] ?? null} />
        </div>

        <div className="mt-6">
          <SectionNav items={nav} />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-12">
            <OverviewSection tour={tour} />
            {tour.expert && (
              <section id="expert" aria-label="Your local expert" className="scroll-mt-32">
                <ExpertCard expert={tour.expert} tourId={tour.id} />
              </section>
            )}
            {has.itinerary && <ItinerarySection tour={tour} departure={selected} />}
            {has.included && <IncludedSection tour={tour} />}
            {has.stays && <StaysSection tour={tour} />}
            {has.food && <FoodSection tour={tour} />}
            {has.activities && <ActivitiesSection tour={tour} />}
            {has.transport && <TransportSection tour={tour} />}
            {has.meeting && <MeetingPointSection tour={tour} />}
            {has.safety && <SafetySection tour={tour} />}
            <PricingSection tour={tour} />
            {has.extras && <ExtrasSection tour={tour} />}
            {has.policies && <PoliciesSection tour={tour} />}
            <DetailSection id="reviews" title="Traveler reviews" icon={<Star />}>
              <ReviewsList tourId={tour.id} />
            </DetailSection>
            <FrequentlyBookedWith endpoint={`/api/v1/tours/${tour.id}/frequently-booked-with`} />
            <SimilarTours tourId={tour.id} />
          </div>

          <aside id="book" className="scroll-mt-32 lg:sticky lg:top-32 lg:self-start">
            <BookingCard tour={tour} departures={departures} selected={selected} onSelect={setSelectedId} />
          </aside>
        </div>
      </div>
      {departures.length > 0 && <MobileBookBar price={lowestUpcomingPrice(tour, departures)} />}
    </div>
  );
}

function TourSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-9 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/2" />
      <Skeleton className="mt-5 h-[260px] rounded-3xl sm:h-[380px] lg:h-[440px]" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
