"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SponsoredResults } from "@/components/shared/SponsoredResults";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/lib/api-client";
import { PROPERTY_TYPE_LABELS, type Property } from "@/types/stay";

export default function StaysSearchPage() {
  const [locationSlug, setLocationSlug] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [params, setParams] = useState<{ slug: string; checkIn: string; checkOut: string; guests: number } | null>(null);

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

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Explore Stays</h1>
      <p className="mt-1 text-sm text-zinc-500">Search hotels, resorts, homestays and guesthouses by destination and dates.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ slug: locationSlug, checkIn, checkOut, guests });
        }}
        className="mt-6 flex flex-wrap items-end gap-2"
      >
        <Input value={locationSlug} onChange={(e) => setLocationSlug(e.target.value)} placeholder="Destination slug" className="flex-1 min-w-[10rem]" />
        <Input type="date" label="Check-in" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        <Input type="date" label="Check-out" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        <Input type="number" label="Guests" min={1} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-20" />
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {params?.slug && <div className="mt-8"><SponsoredResults locationSlug={params.slug} entityType="property" linkPrefix="/stays" /></div>}

      {isLoading && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Couldn't load stays right now. Please try again." />}
      {params && !isLoading && !isError && (stays ?? []).length === 0 && (
        <EmptyState icon={Building2} title="No stays found" description="Try different dates or a different destination." />
      )}

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(stays ?? []).map((prop, i) => (
          <motion.div
            key={prop.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          >
            <Link href={`/stays/${prop.id}`}>
              <Card hoverable className="flex h-full flex-col">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{prop.name}</h3>
                <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">{PROPERTY_TYPE_LABELS[prop.property_type]}</p>
                {prop.description && <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{prop.description}</p>}
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
