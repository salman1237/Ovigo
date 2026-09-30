"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, Plus, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "@/types/rentcar";
import { RIDE_REQUEST_STATUS_LABELS, type RideRequest } from "@/types/rideRequest";

import type { MapLocation } from "@/components/shared/LocationMapPicker";

// Leaflet touches `window` at import time — never load it during SSR.
const LocationMapPicker = dynamic(
  () => import("@/components/shared/LocationMapPicker").then((m) => m.LocationMapPicker),
  { ssr: false, loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" /> }
);

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  open: "success",
  closed: "primary",
  cancelled: "neutral",
};

export default function RideRequestsPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["ride-requests", "mine"],
    queryFn: () => apiClient.get<RideRequest[]>("/api/v1/ride-requests", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["ride-requests"] });

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Request a Ride</h1>
        <Button size="sm" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New request"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Tell us where you want to go and get bids from local rent-a-car operators.
      </p>

      {showForm && (
        <RequestForm
          onCreated={() => {
            setShowForm(false);
            refetch();
          }}
        />
      )}

      {isLoading && <Spinner />}
      {!isLoading && (requests ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No ride requests yet" description="Post a route above to get bids from rent-a-car partners." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(requests ?? []).map((r) => (
          <Link key={r.id} href={`/rent-a-car/requests/${r.id}`}>
            <Card hoverable variant="elevated">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-medium text-zinc-900 dark:text-zinc-50">
                    <MapPin className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
                    {r.pickup_label} <span className="text-zinc-400">→</span> {r.dropoff_label}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {r.departure_date}</span>
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.passengers}</span>
                    <span>{r.bid_count} bid{r.bid_count === 1 ? "" : "s"}</span>
                  </p>
                </div>
                <Badge variant={STATUS_VARIANTS[r.status]}>{RIDE_REQUEST_STATUS_LABELS[r.status]}</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

const VEHICLE_TYPES = Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[];

function RequestForm({ onCreated }: { onCreated: () => void }) {
  const [pickup, setPickup] = useState<MapLocation | null>(null);
  const [dropoff, setDropoff] = useState<MapLocation | null>(null);
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [vehicleType, setVehicleType] = useState<VehicleType | "">("");
  const [withDriver, setWithDriver] = useState<"" | "yes" | "no">("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!pickup || !dropoff) {
      setError("Please pick both a pickup and drop-off location.");
      return;
    }
    if (!departureDate) {
      setError("Please pick a departure date.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        "/api/v1/ride-requests",
        {
          pickup_label: pickup.label,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          dropoff_label: dropoff.label,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          departure_date: departureDate,
          departure_time: departureTime || undefined,
          passengers,
          vehicle_type_preference: vehicleType || undefined,
          with_driver_preference: withDriver === "" ? undefined : withDriver === "yes",
          budget_min: budgetMin || undefined,
          budget_max: budgetMax || undefined,
          notes: notes || undefined,
        },
        { auth: true }
      );
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="elevated" className="mt-4 flex flex-col gap-4">
      <LocationMapPicker label="Pickup location" value={pickup} onChange={setPickup} />
      <LocationMapPicker label="Drop-off location" value={dropoff} onChange={setDropoff} />

      <div className="grid grid-cols-2 gap-3">
        <Input type="date" label="Departure date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
        <Input type="time" label="Departure time (optional)" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input type="number" label="Passengers" min={1} value={passengers} onChange={(e) => setPassengers(Number(e.target.value))} />
        <Select label="Vehicle type (optional)" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as VehicleType | "")}>
          <option value="">Any</option>
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>
          ))}
        </Select>
      </div>

      <Select label="Driver preference (optional)" value={withDriver} onChange={(e) => setWithDriver(e.target.value as "" | "yes" | "no")}>
        <option value="">Either is fine</option>
        <option value="yes">With a driver</option>
        <option value="no">Self-drive</option>
      </Select>

      <div className="grid grid-cols-2 gap-3">
        <Input type="number" label="Budget min (optional)" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
        <Input type="number" label="Budget max (optional)" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
      </div>
      {budgetMin && budgetMax && (
        <p className="text-xs text-zinc-400">Budget range: {formatMoney(budgetMin)} – {formatMoney(budgetMax)}</p>
      )}

      <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything partners should know…" />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!pickup || !dropoff || !departureDate} className="self-start">
        <Plus className="h-4 w-4" /> Post request
      </Button>
    </Card>
  );
}
