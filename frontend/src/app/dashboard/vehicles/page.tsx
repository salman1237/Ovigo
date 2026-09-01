"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { TransmissionType, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, Vehicle, VehicleType } from "@/types/rentcar";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[];

export default function DashboardVehiclesPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
  const [transmission, setTransmission] = useState<TransmissionType>("automatic");
  const [pricePerDay, setPricePerDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: vehicles, isLoading, isError, error: fetchError } = useQuery({
    queryKey: ["my-vehicles"],
    queryFn: () => apiClient.get<Vehicle[]>("/api/v1/vehicles/mine", { auth: true }),
    enabled: !!user,
    retry: false,
  });

  const notEligible = isError && fetchError instanceof ApiError && fetchError.status === 403;

  const createVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const vehicle = await apiClient.post<Vehicle>(
        "/api/v1/vehicles",
        { make, model, year, vehicle_type: vehicleType, transmission, price_per_day: pricePerDay },
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["my-vehicles"] });
      router.push(`/dashboard/vehicles/${vehicle.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create vehicle");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">Sign in as an approved Rent-a-Car partner to manage vehicles.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-zinc-900 dark:text-zinc-50">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  if (notEligible) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your Vehicles</h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Rent-a-Car partners only. Apply at{" "}
          <Link href="/account/partner" className="underline">Become a Partner</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your Vehicles</h1>

      <form onSubmit={createVehicle} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Make</label>
          <input value={make} onChange={(e) => setMake(e.target.value)} required className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Model</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} required className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} required className="mt-1 w-20 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Type</label>
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)} className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Transmission</label>
          <select value={transmission} onChange={(e) => setTransmission(e.target.value as TransmissionType)} className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
            <option value="automatic">Automatic</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Price/day (৳)</label>
          <input value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} required placeholder="3000.00" className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <button type="submit" disabled={submitting} className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900">
          {submitting ? "Creating…" : "Create draft vehicle"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(vehicles ?? []).map((v) => (
          <Link
            key={v.id}
            href={`/dashboard/vehicles/${v.id}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{v.make} {v.model} ({v.year})</p>
              <p className="text-xs text-zinc-500">{formatMoney(v.price_per_day)}/day</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[v.status]}`}>
              {VEHICLE_STATUS_LABELS[v.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
