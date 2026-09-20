"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

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
import { firstImageId, propertyImageUrl } from "@/lib/media";
import type { Location } from "@/types/location";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS, type AmenityKey, type Property, type PropertyType } from "@/types/stay";

const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[];
const AMENITIES = Object.keys(AMENITY_LABELS) as AmenityKey[];

export default function StaysSearchPage() {
  return (
    <Suspense>
      <StaysSearchContent />
    </Suspense>
  );
}

function StaysSearchContent() {
  const initial = useSearchParams();
  const initialCheckIn = initial.get("check_in") ?? "";
  const initialCheckOut = initial.get("check_out") ?? "";
  const [destinationText, setDestinationText] = useState("");
  const [locationSlug, setLocationSlug] = useState(initial.get("location_slug") ?? "");
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState(Number(initial.get("guests")) || 1);
  // Auto-search only if the hero widget already collected dates — a bare
  // destination with no dates isn't enough for this endpoint to be useful,
  // so that case just pre-fills the form and waits for the traveler to submit.
  const [params, setParams] = useState<{ slug: string; checkIn: string; checkOut: string; guests: number } | null>(
    initialCheckIn && initialCheckOut
      ? { slug: initial.get("location_slug") ?? "", checkIn: initialCheckIn, checkOut: initialCheckOut, guests: Number(initial.get("guests")) || 1 }
      : null
  );

  const [types, setTypes] = useState<Set<PropertyType>>(new Set());
  const [amenities, setAmenities] = useState<Set<AmenityKey>>(new Set());

  const { data: stays, isLoading, isError } = useQuery({
    queryKey: ["stays-search", params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.slug) qs.set("location_slug", params.slug);
      if (params?.checkIn) qs.set("check_in", params.checkIn);
      if (params?.checkOut) qs.set("check_out", params.checkOut);
      qs.set("guests", String(params?.guests ?? 1));
      return apiClient.get<Property[]>(`/api/v1/search/stays?${qs.toString()}`);
    },
    enabled: params !== null,
  });

  const filteredStays = useMemo(() => {
    let list = stays ?? [];
    if (types.size > 0) list = list.filter((p) => types.has(p.property_type));
    if (amenities.size > 0) {
      list = list.filter((p) => {
        const have = new Set(p.amenities.map((a) => a.amenity));
        return [...amenities].every((a) => have.has(a));
      });
    }
    return list;
  }, [stays, types, amenities]);

  const toggle = <T,>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  };

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <BrowseHero title="Explore Stays" subtitle="Hotels, resorts, homestays and guesthouses, booked directly from the host." photoIndex={1} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ slug: locationSlug, checkIn, checkOut, guests });
        }}
        className="relative z-10 -mt-8 flex flex-col gap-2.5 rounded-2xl border border-zinc-200 bg-white p-3 shadow-elevated dark:border-zinc-800 dark:bg-zinc-900 sm:-mt-10 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <DestinationSearchInput
          value={destinationText}
          onSelect={(loc: Location) => {
            setDestinationText(loc.name);
            setLocationSlug(loc.slug);
          }}
          placeholder="Which city or area?"
        />
        <Input type="date" label="Check-in" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        <Input type="date" label="Check-out" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        <Input type="number" label="Guests" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-20" />
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {params?.slug && <div className="mt-8"><SponsoredResults locationSlug={params.slug} entityType="property" linkPrefix="/stays" /></div>}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="flex shrink-0 flex-col gap-3 lg:w-64">
          <FilterGroup title="Property type">
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((t) => (
                <FilterChip key={t} label={PROPERTY_TYPE_LABELS[t]} selected={types.has(t)} onClick={() => toggle(types, setTypes, t)} />
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Amenities">
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => (
                <FilterChip key={a} label={AMENITY_LABELS[a]} selected={amenities.has(a)} onClick={() => toggle(amenities, setAmenities, a)} />
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
          {isError && <ErrorState message="Couldn't load stays right now. Please try again." />}
          {params && !isLoading && !isError && filteredStays.length === 0 && (
            <EmptyState icon={Building2} title="No stays found" description="Try different dates, a different destination, or fewer filters." />
          )}
          {!params && !isLoading && (
            <EmptyState icon={Building2} title="Pick your dates" description="Search a destination and dates above to see available stays." />
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {filteredStays.map((prop, i) => {
              const cover = firstImageId(prop.images);
              return (
                <motion.div
                  key={prop.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
                >
                  <Link href={`/stays/${prop.id}`}>
                    <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0 sm:flex-row">
                      <div className="aspect-[4/3] w-full shrink-0 bg-zinc-100 dark:bg-zinc-800 sm:aspect-square sm:w-48">
                        {cover && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={propertyImageUrl(prop.id, cover.id)}
                            alt={prop.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{prop.name}</h3>
                        <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">{PROPERTY_TYPE_LABELS[prop.property_type]}</p>
                        {prop.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{prop.description}</p>}
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
