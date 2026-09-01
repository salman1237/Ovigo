"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Car } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { TransmissionType, VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, Vehicle, VehicleType } from "@/types/rentcar";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
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
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
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
          <Link href="/account/partner" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">Become a Partner</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your Vehicles</h1>

      <Card as="form" onSubmit={createVehicle} className="mt-6 flex flex-wrap items-end gap-3">
        <Input label="Make" value={make} onChange={(e) => setMake(e.target.value)} required className="w-28" />
        <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} required className="w-28" />
        <Input type="number" label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))} required className="w-24" />
        <Select label="Type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType)} className="w-auto">
          {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>)}
        </Select>
        <Select label="Transmission" value={transmission} onChange={(e) => setTransmission(e.target.value as TransmissionType)} className="w-auto">
          <option value="automatic">Automatic</option>
          <option value="manual">Manual</option>
        </Select>
        <Input label="Price/day (৳)" value={pricePerDay} onChange={(e) => setPricePerDay(e.target.value)} required placeholder="3000.00" className="w-28" />
        <Button type="submit" loading={submitting}>
          {submitting ? "Creating…" : "Create draft vehicle"}
        </Button>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <Spinner />}
      {!isLoading && (vehicles ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState icon={Car} title="No vehicles yet" description="Create your first draft vehicle above." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(vehicles ?? []).map((v) => (
          <Link key={v.id} href={`/dashboard/vehicles/${v.id}`}>
            <Card hoverable className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{v.make} {v.model} ({v.year})</p>
                <p className="text-xs text-zinc-500">{formatMoney(v.price_per_day)}/day</p>
              </div>
              <Badge variant={STATUS_VARIANTS[v.status]}>{VEHICLE_STATUS_LABELS[v.status]}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
