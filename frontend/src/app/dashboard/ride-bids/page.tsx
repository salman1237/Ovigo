"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, Gavel, MapPin } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Vehicle } from "@/types/rentcar";
import { RIDE_BID_STATUS_LABELS, type RideBid, type RideRequest } from "@/types/rideRequest";

type Tab = "open" | "mine";

export default function RideBidsPage() {
  const [tab, setTab] = useState<Tab>("open");
  const queryClient = useQueryClient();

  const { data: open, isLoading: openLoading, isError: openError, error: openErr } = useQuery({
    queryKey: ["ride-bids", "open-requests"],
    queryFn: () => apiClient.get<RideRequest[]>("/api/v1/ride-bids/open-requests", { auth: true }),
    retry: false,
  });

  const { data: myBids, isLoading: myBidsLoading } = useQuery({
    queryKey: ["ride-bids", "mine"],
    queryFn: () => apiClient.get<RideBid[]>("/api/v1/ride-bids/mine", { auth: true }),
    retry: false,
    enabled: tab === "mine",
  });

  const { data: myVehicles } = useQuery({
    queryKey: ["vehicles", "mine"],
    queryFn: () => apiClient.get<Vehicle[]>("/api/v1/vehicles/mine", { auth: true }),
  });

  const notEligibleRole = openError && openErr instanceof ApiError && openErr.status === 403;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["ride-bids"] });

  if (notEligibleRole) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          <Gavel className="h-6 w-6 text-primary-600 dark:text-primary-400" /> Ride Requests
        </h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Rent-a-Car partners only. Apply to become one from &quot;Become a Partner&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        <Gavel className="h-6 w-6 text-primary-600 dark:text-primary-400" /> Ride Requests
      </h1>
      <p className="mt-1 text-sm text-zinc-500">Bid on travelers&apos; posted routes with a price and a car from your fleet.</p>

      <div className="mt-4 flex gap-2">
        {(["open", "mine"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t === "open" ? "Open requests" : "My bids"}
          </button>
        ))}
      </div>

      {tab === "open" && (
        <div className="mt-6 flex flex-col gap-4">
          {openLoading && <Spinner />}
          {!openLoading && (open ?? []).length === 0 && (
            <EmptyState title="No open requests" description="No ride requests are open right now." />
          )}
          {(open ?? []).map((r) => (
            <RequestCard key={r.id} request={r} vehicles={myVehicles ?? []} onBidSubmitted={refetch} />
          ))}
        </div>
      )}

      {tab === "mine" && (
        <div className="mt-6 flex flex-col gap-3">
          {myBidsLoading && <Spinner />}
          {!myBidsLoading && (myBids ?? []).length === 0 && (
            <EmptyState title="No bids yet" description="You haven't placed any bids yet." />
          )}
          {(myBids ?? []).map((bid) => (
            <MyBidCard key={bid.id} bid={bid} onChange={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request,
  vehicles,
  onBidSubmitted,
}: {
  request: RideRequest;
  vehicles: Vehicle[];
  onBidSubmitted: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [price, setPrice] = useState("");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [withDriver, setWithDriver] = useState(false);
  const [message, setMessage] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!price) {
      setError("Enter your price.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        `/api/v1/ride-requests/${request.id}/bids`,
        {
          price,
          vehicle_id: vehicleId || undefined,
          with_driver: withDriver,
          message: message || undefined,
          valid_until: validUntil || undefined,
        },
        { auth: true }
      );
      setShowForm(false);
      onBidSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit bid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="elevated">
      <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-50">
        <MapPin className="h-4 w-4 text-primary-600 dark:text-primary-400" />
        {request.pickup_label} <span className="text-zinc-400">→</span> {request.dropoff_label}
      </h3>
      <p className="mt-1 text-xs text-zinc-500">
        {request.departure_date}
        {request.departure_time ? ` · ${request.departure_time}` : ""} · {request.passengers} passenger{request.passengers === 1 ? "" : "s"}
        {request.budget_min && request.budget_max && (
          <> · Budget: {formatMoney(request.budget_min)} – {formatMoney(request.budget_max)}</>
        )}
      </p>
      {request.notes && <p className="mt-1 text-xs text-zinc-400">{request.notes}</p>}

      {!showForm && (
        <Button size="sm" variant="secondary" onClick={() => setShowForm(true)} className="mt-3">
          Place a bid
        </Button>
      )}

      {showForm && (
        <div className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Your price (৳)" />
            <Input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} placeholder="Bid valid until" />
          </div>
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">No specific vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.make} {v.model} ({v.year})</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={withDriver} onChange={(e) => setWithDriver(e.target.checked)} className="rounded border-zinc-300" />
            Comes with a driver
          </label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to the traveler (optional)" rows={2} />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} loading={busy}>
              Submit bid
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MyBidCard({ bid, onChange }: { bid: RideBid; onChange: () => void }) {
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    const ok = await confirm({
      title: "Withdraw this bid?",
      description: "This can't be undone.",
      confirmLabel: "Withdraw",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/ride-bids/${bid.id}/withdraw`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to withdraw");
    } finally {
      setBusy(false);
    }
  };

  const statusVariant =
    bid.status === "accepted" ? "success" : bid.status === "rejected" || bid.status === "withdrawn" ? "danger" : "neutral";

  return (
    <Card variant="elevated">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">{formatMoney(bid.price)}</span>
        <Badge variant={statusVariant} className="capitalize">{RIDE_BID_STATUS_LABELS[bid.status]}</Badge>
      </div>
      {bid.vehicle && (
        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
          <Car className="h-3.5 w-3.5" /> {bid.vehicle.make} {bid.vehicle.model} ({bid.vehicle.year})
        </p>
      )}
      {bid.message && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{bid.message}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {bid.status === "pending" && (
        <Button size="sm" variant="destructive" onClick={withdraw} loading={busy} className="mt-2">
          Withdraw
        </Button>
      )}
    </Card>
  );
}
