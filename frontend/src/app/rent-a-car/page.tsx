"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Car, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_LABELS, type Vehicle } from "@/types/rentcar";

export default function RentACarSearchPage() {
  const [locationSlug, setLocationSlug] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: vehicles, isLoading, isError } = useQuery({
    queryKey: ["vehicles-search", searchTerm],
    queryFn: () =>
      apiClient.get<Vehicle[]>(`/api/v1/vehicles${searchTerm ? `?location_slug=${searchTerm}` : ""}`),
  });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Rent a Car</h1>
      <p className="mt-1 text-sm text-zinc-500">Browse vehicles by destination.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchTerm(locationSlug);
        }}
        className="mt-6 flex flex-col gap-2 sm:flex-row"
      >
        <Input
          value={locationSlug}
          onChange={(e) => setLocationSlug(e.target.value)}
          placeholder="Destination slug, e.g. dhaka, coxs-bazar"
          className="flex-1"
        />
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {isLoading && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Couldn't load vehicles right now. Please try again." />}
      {!isLoading && !isError && (vehicles ?? []).length === 0 && (
        <EmptyState icon={Car} title="No vehicles found" description="Try a different destination." />
      )}

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(vehicles ?? []).map((v, i) => (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
          >
            <Link href={`/rent-a-car/${v.id}`}>
              <Card hoverable className="flex h-full flex-col">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {v.make} {v.model} ({v.year})
                </h3>
                <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                  {VEHICLE_TYPE_LABELS[v.vehicle_type]} · {v.seats} seats · {formatMoney(v.price_per_day)}/day
                  {v.with_driver && " · with driver"}
                </p>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
