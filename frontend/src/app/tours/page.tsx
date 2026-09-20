"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { BrowseHero } from "@/components/shared/BrowseHero";
import { DestinationSearchInput } from "@/components/shared/DestinationSearchInput";
import { FilterChip } from "@/components/shared/FilterChip";
import { FilterGroup } from "@/components/shared/FilterGroup";
import { SponsoredResults } from "@/components/shared/SponsoredResults";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { firstImageId, tourImageUrl } from "@/lib/media";
import type { Location } from "@/types/location";
import type { TourSummary } from "@/types/tour";

const DURATION_BUCKETS = [
  { id: "short", label: "1-3 days", test: (d: number) => d <= 3 },
  { id: "medium", label: "4-7 days", test: (d: number) => d >= 4 && d <= 7 },
  { id: "long", label: "8+ days", test: (d: number) => d >= 8 },
];

export default function ToursSearchPage() {
  return (
    <Suspense>
      <ToursSearchContent />
    </Suspense>
  );
}

function ToursSearchContent() {
  const initial = useSearchParams();
  const [destinationText, setDestinationText] = useState("");
  const [keyword, setKeyword] = useState(initial.get("q") ?? "");
  const [searchTerm, setSearchTerm] = useState(initial.get("location_slug") ?? "");
  const [searchKeyword, setSearchKeyword] = useState(initial.get("q") ?? "");

  const [maxPrice, setMaxPrice] = useState("");
  const [durations, setDurations] = useState<Set<string>>(new Set());

  const { data: tours, isLoading, isError } = useQuery({
    queryKey: ["tours-search", searchTerm, searchKeyword],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set("location_slug", searchTerm);
      if (searchKeyword) params.set("q", searchKeyword);
      const qs = params.toString();
      return apiClient.get<TourSummary[]>(`/api/v1/tours${qs ? `?${qs}` : ""}`);
    },
  });

  const filteredTours = useMemo(() => {
    let list = tours ?? [];
    if (maxPrice) list = list.filter((t) => Number(t.base_price) <= Number(maxPrice));
    if (durations.size > 0) {
      const active = DURATION_BUCKETS.filter((b) => durations.has(b.id));
      list = list.filter((t) => active.some((b) => b.test(t.duration_days)));
    }
    return list;
  }, [tours, maxPrice, durations]);

  const toggleDuration = (id: string) => {
    setDurations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <BrowseHero title="Explore Tours" subtitle="Fixed-date tours led by verified local experts." photoIndex={0} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchKeyword(keyword);
        }}
        className="relative z-10 -mt-4 flex flex-col gap-2.5 rounded-2xl border border-zinc-200 bg-white p-3 shadow-elevated dark:border-zinc-800 dark:bg-zinc-900 sm:-mt-6 sm:flex-row sm:items-center"
      >
        <DestinationSearchInput
          value={destinationText}
          onSelect={(loc: Location) => {
            setDestinationText(loc.name);
            setSearchTerm(loc.slug);
          }}
          placeholder="Where to?"
        />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword, e.g. mangrove, trekking"
          className="sm:w-56"
        />
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {searchTerm && <div className="mt-8"><SponsoredResults locationSlug={searchTerm} entityType="tour" linkPrefix="/tours" /></div>}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="flex shrink-0 flex-col gap-3 lg:w-64">
          <FilterGroup title="Price">
            <Input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max price (৳)"
            />
          </FilterGroup>
          <FilterGroup title="Duration">
            <div className="flex flex-wrap gap-2">
              {DURATION_BUCKETS.map((b) => (
                <FilterChip key={b.id} label={b.label} selected={durations.has(b.id)} onClick={() => toggleDuration(b.id)} />
              ))}
            </div>
          </FilterGroup>
        </aside>

        <div className="min-w-0 flex-1">
          {isLoading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          )}
          {isError && <ErrorState message="Couldn't load tours right now. Please try again." />}
          {!isLoading && !isError && filteredTours.length === 0 && (
            <EmptyState icon={MapPin} title="No tours found" description="Try a different destination or clear your filters." />
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {filteredTours.map((tour, i) => {
              const cover = firstImageId(tour.images);
              return (
                <motion.div
                  key={tour.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
                >
                  <Link href={`/tours/${tour.id}`}>
                    <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0 sm:flex-row">
                      <div className="aspect-[4/3] w-full shrink-0 bg-zinc-100 dark:bg-zinc-800 sm:aspect-square sm:w-48">
                        {cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tourImageUrl(tour.id, cover.id)}
                            alt={tour.title}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
                        <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                          {tour.duration_days} days · from {formatMoney(tour.base_price)} <ApproxPrice amountBDT={tour.base_price} />
                        </p>
                        {tour.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{tour.description}</p>}
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
