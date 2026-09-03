"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { Card } from "@/components/ui/Card";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
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
        {vehicles.map((vehicle) => (
          <Link key={vehicle.id} href={`/rent-a-car/${vehicle.id}`}>
            <Card hoverable className="flex h-full flex-col p-3">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {vehicle.make} {vehicle.model} ({vehicle.year})
              </p>
              <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
                {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} · {formatMoney(vehicle.price_per_day)}/day{" "}
                <ApproxPrice amountBDT={vehicle.price_per_day} />
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
