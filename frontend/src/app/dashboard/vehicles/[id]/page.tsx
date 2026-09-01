"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { LocationPicker } from "@/components/shared/LocationPicker";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import { Driver, VEHICLE_STATUS_LABELS, Vehicle } from "@/types/rentcar";

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

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !vehicle) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{vehicle.make} {vehicle.model} ({vehicle.year})</h1>
          <p className="text-sm text-zinc-500">{VEHICLE_STATUS_LABELS[vehicle.status]} · {formatMoney(vehicle.price_per_day)}/day</p>
        </div>
        {(vehicle.status === "draft" || vehicle.status === "rejected") && (
          <button
            onClick={() => run(() => apiClient.post(`/api/v1/vehicles/${id}/submit`, undefined, { auth: true }))}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Submit for review
          </button>
        )}
      </div>

      {vehicle.rejection_reason && (
        <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Rejected: {vehicle.rejection_reason}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Section title="Assigned Driver">
        <select
          value={vehicle.assigned_driver_id ?? ""}
          onChange={(e) => run(() => apiClient.put(`/api/v1/vehicles/${id}`, { assigned_driver_id: e.target.value || null }, { auth: true }))}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">No driver assigned</option>
          {(drivers ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.full_name} — {d.license_number}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Manage your driver roster from the &quot;My Drivers&quot; page.
        </p>
      </Section>

      <Section title="Destinations">
        <LocationsSection vehicleId={id} run={run} />
      </Section>

      <Section title="Availability">
        <AvailabilitySection vehicleId={id} run={run} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LocationsSection({ vehicleId, run }: { vehicleId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <>
      <LocationPicker selected={locations} onChange={setLocations} />
      <button
        onClick={() =>
          run(() =>
            apiClient.post(`/api/v1/vehicles/${vehicleId}/locations`, { location_ids: locations.map((l) => l.id) }, { auth: true })
          )
        }
        disabled={locations.length === 0}
        className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
      >
        Save destinations
      </button>
    </>
  );
}

function AvailabilitySection({ vehicleId, run }: { vehicleId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
      <select value={isAvailable ? "yes" : "no"} onChange={(e) => setIsAvailable(e.target.value === "yes")} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900">
        <option value="yes">Available</option>
        <option value="no">Unavailable</option>
      </select>
      <button
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
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
      >
        Set availability
      </button>
    </div>
  );
}
