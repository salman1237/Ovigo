"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_ICONS } from "@/lib/vehicleIcons";
import { VEHICLE_TYPE_LABELS, type Vehicle } from "@/types/rentcar";

export function SimilarVehicles({ vehicleId }: { vehicleId: string }) {
  const { data: vehicles } = useQuery({
    queryKey: ["similar-vehicles", vehicleId],
    queryFn: () => apiClient.get<Vehicle[]>(`/api/v1/vehicles/${vehicleId}/similar`),
  });

  if (!vehicles || vehicles.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Similar vehicles</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {vehicles.map((vehicle) => {
          const TypeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicle_type];
          return (
            <Link key={vehicle.id} href={`/rent-a-car/${vehicle.id}`}>
              <Card hoverable className="flex h-full items-center gap-3 p-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-indigo-600">
                  <TypeIcon className="h-8 w-8 text-white/90" strokeWidth={1.25} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </p>
                  <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                    {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} · {formatMoney(vehicle.price_per_day)}/day{" "}
                    <ApproxPrice amountBDT={vehicle.price_per_day} />
                  </p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
