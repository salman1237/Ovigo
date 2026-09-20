"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Car, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { BrowseHero } from "@/components/shared/BrowseHero";
import { DestinationSearchInput } from "@/components/shared/DestinationSearchInput";
import { FilterChip } from "@/components/shared/FilterChip";
import { FilterGroup } from "@/components/shared/FilterGroup";
import { SponsoredResults } from "@/components/shared/SponsoredResults";
import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_ICONS } from "@/lib/vehicleIcons";
import type { Location } from "@/types/location";
import { VEHICLE_TYPE_LABELS, type TransmissionType, type Vehicle, type VehicleType } from "@/types/rentcar";

const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[];
const TRANSMISSIONS: { id: TransmissionType; label: string }[] = [
  { id: "automatic", label: "Automatic" },
  { id: "manual", label: "Manual" },
];

export default function RentACarSearchPage() {
  return (
    <Suspense>
      <RentACarSearchContent />
    </Suspense>
  );
}

function RentACarSearchContent() {
  const initial = useSearchParams();
  const [destinationText, setDestinationText] = useState("");
  const [searchTerm, setSearchTerm] = useState(initial.get("location_slug") ?? "");

  const [types, setTypes] = useState<Set<VehicleType>>(new Set());
  const [transmissions, setTransmissions] = useState<Set<TransmissionType>>(new Set());
  const [maxPrice, setMaxPrice] = useState("");

  const { data: vehicles, isLoading, isError } = useQuery({
    queryKey: ["vehicles-search", searchTerm],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set("location_slug", searchTerm);
      const qs = params.toString();
      return apiClient.get<Vehicle[]>(`/api/v1/vehicles${qs ? `?${qs}` : ""}`);
    },
  });

  const filteredVehicles = useMemo(() => {
    let list = vehicles ?? [];
    if (types.size > 0) list = list.filter((v) => types.has(v.vehicle_type));
    if (transmissions.size > 0) list = list.filter((v) => transmissions.has(v.transmission));
    if (maxPrice) list = list.filter((v) => Number(v.price_per_day) <= Number(maxPrice));
    return list;
  }, [vehicles, types, transmissions, maxPrice]);

  const toggle = <T,>(set: Set<T>, setSet: (s: Set<T>) => void, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  };

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <BrowseHero title="Rent a Car" subtitle="Sedans, SUVs and vans, with or without a driver." photoIndex={2} />

      <form
        onSubmit={(e) => e.preventDefault()}
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
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {searchTerm && <div className="mt-8"><SponsoredResults locationSlug={searchTerm} entityType="vehicle" linkPrefix="/rent-a-car" /></div>}

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <aside className="flex shrink-0 flex-col gap-3 lg:w-64">
          <FilterGroup title="Price">
            <Input
              type="number"
              min={0}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="Max price per day (৳)"
            />
          </FilterGroup>
          <FilterGroup title="Vehicle type">
            <div className="flex flex-wrap gap-2">
              {VEHICLE_TYPES.map((t) => (
                <FilterChip key={t} label={VEHICLE_TYPE_LABELS[t]} selected={types.has(t)} onClick={() => toggle(types, setTypes, t)} />
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Transmission">
            <div className="flex flex-wrap gap-2">
              {TRANSMISSIONS.map((t) => (
                <FilterChip key={t.id} label={t.label} selected={transmissions.has(t.id)} onClick={() => toggle(transmissions, setTransmissions, t.id)} />
              ))}
            </div>
          </FilterGroup>
        </aside>

        <div className="min-w-0 flex-1">
          {isLoading && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          )}
          {isError && <ErrorState message="Couldn't load vehicles right now. Please try again." />}
          {!isLoading && !isError && filteredVehicles.length === 0 && (
            <EmptyState icon={Car} title="No vehicles found" description="Try a different destination or fewer filters." />
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {filteredVehicles.map((v, i) => {
              const TypeIcon = VEHICLE_TYPE_ICONS[v.vehicle_type];
              return (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
                >
                  <Link href={`/rent-a-car/${v.id}`}>
                    <Card hoverable variant="elevated" className="flex h-full flex-col overflow-hidden p-0 sm:flex-row">
                      <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center bg-gradient-to-br from-primary-500 to-indigo-600 sm:aspect-square sm:w-40">
                        <TypeIcon className="h-14 w-14 text-white/90" strokeWidth={1.25} />
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {v.make} {v.model} ({v.year})
                        </h3>
                        <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                          {VEHICLE_TYPE_LABELS[v.vehicle_type]} · {v.seats} seats · {formatMoney(v.price_per_day)}/day{" "}
                          <ApproxPrice amountBDT={v.price_per_day} />
                          {v.with_driver && " · with driver"}
                        </p>
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
