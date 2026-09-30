"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, MapPin, UserRound } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { LocationPicker } from "@/components/shared/LocationPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import { Driver, VEHICLE_STATUS_LABELS, Vehicle } from "@/types/rentcar";

type RunFn = (fn: () => Promise<unknown>) => void;

export default function VehicleEditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => apiClient.get<Vehicle>(`/api/v1/vehicles/${id}`, { auth: true }),
  });

  const { data: drivers } = useQuery({
    queryKey: ["drivers", "mine"],
    queryFn: () => apiClient.get<Driver[]>("/api/v1/drivers/mine", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["vehicle", id] });

  const run: RunFn = async (fn) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !vehicle) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const statusVariant = vehicle.status === "published" ? "success" : vehicle.status === "rejected" ? "danger" : vehicle.status === "pending_review" ? "warning" : "neutral";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">
            {vehicle.make} {vehicle.model} <span className="text-zinc-400 font-normal">({vehicle.year})</span>
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={statusVariant} className="capitalize">{VEHICLE_STATUS_LABELS[vehicle.status]}</Badge>
            <span className="text-sm font-medium text-zinc-500">{formatMoney(vehicle.price_per_day)}/day</span>
          </div>
        </div>
        {(vehicle.status === "draft" || vehicle.status === "rejected") && (
          <Button onClick={() => run(() => apiClient.post(`/api/v1/vehicles/${id}/submit`, undefined, { auth: true }))}>
            Submit for review
          </Button>
        )}
      </div>

      {vehicle.rejection_reason && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="font-semibold">Rejected: </span>
          {vehicle.rejection_reason}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-6">
        <Section title="Assigned Driver" icon={<UserRound className="h-4 w-4" />}>
          <Select
            value={vehicle.assigned_driver_id ?? ""}
            onChange={(e) => run(() => apiClient.put(`/api/v1/vehicles/${id}`, { assigned_driver_id: e.target.value || null }, { auth: true }))}
            className="w-auto"
          >
            <option value="">No driver assigned</option>
            {(drivers ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.full_name} — {d.license_number}</option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-zinc-500">
            Manage your driver roster from the &quot;My Drivers&quot; page.
          </p>
        </Section>

        <Section title="Destinations" icon={<MapPin className="h-4 w-4" />}>
          <LocationsSection vehicleId={id} run={run} />
        </Section>

        <Section title="Availability" icon={<CalendarRange className="h-4 w-4" />}>
          <AvailabilitySection vehicleId={id} run={run} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="elevated">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {icon && <span className="text-primary-600 dark:text-primary-400">{icon}</span>}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function LocationsSection({ vehicleId, run }: { vehicleId: string; run: RunFn }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <>
      <LocationPicker selected={locations} onChange={setLocations} />
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          run(() =>
            apiClient.post(`/api/v1/vehicles/${vehicleId}/locations`, { location_ids: locations.map((l) => l.id) }, { auth: true })
          )
        }
        disabled={locations.length === 0}
        className="mt-3"
      >
        Save destinations
      </Button>
    </>
  );
}

function AvailabilitySection({ vehicleId, run }: { vehicleId: string; run: RunFn }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      <Select label="Status" value={isAvailable ? "yes" : "no"} onChange={(e) => setIsAvailable(e.target.value === "yes")} className="w-auto">
        <option value="yes">Available</option>
        <option value="no">Unavailable</option>
      </Select>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          run(() =>
            apiClient.put(
              "/api/v1/vehicles/availability",
              { vehicle_id: vehicleId, start_date: startDate, end_date: endDate, is_available: isAvailable },
              { auth: true }
            )
          )
        }
        disabled={!startDate || !endDate}
      >
        Set availability
      </Button>
    </div>
  );
}
