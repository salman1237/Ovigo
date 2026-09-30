"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Car, MapPin, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { VEHICLE_TYPE_LABELS } from "@/types/rentcar";
import {
  RIDE_BID_STATUS_LABELS,
  RIDE_REQUEST_STATUS_LABELS,
  type RideBid,
  type RideBidWithBooking,
  type RideRequest,
} from "@/types/rideRequest";

export default function RideRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);

  const { data: request, isLoading } = useQuery({
    queryKey: ["ride-requests", id],
    queryFn: () => apiClient.get<RideRequest>(`/api/v1/ride-requests/${id}`, { auth: true }),
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["ride-requests", id, "bids"],
    queryFn: () => apiClient.get<RideBid[]>(`/api/v1/ride-requests/${id}/bids`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["ride-requests", id] });

  const cancelRequest = async () => {
    const ok = await confirm({
      title: "Cancel this ride request?",
      description: "This can't be undone. Partners will no longer be able to bid on it.",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep request",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await apiClient.post(`/api/v1/ride-requests/${id}/cancel`, undefined, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    }
  };

  const acceptBid = async (bidId: string) => {
    const ok = await confirm({
      title: "Accept this bid?",
      description: "This will book the ride and take you to payment. Other bids will be rejected.",
      confirmLabel: "Accept & book",
    });
    if (!ok) return;
    setError(null);
    setBusyBidId(bidId);
    try {
      const result = await apiClient.post<RideBidWithBooking>(
        `/api/v1/ride-requests/${id}/bids/${bidId}/accept`,
        undefined,
        { auth: true }
      );
      router.push(`/bookings/${result.booking_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept bid");
      setBusyBidId(null);
    }
  };

  if (isLoading || !request) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const statusVariant: BadgeProps["variant"] = request.status === "open" ? "success" : request.status === "closed" ? "primary" : "neutral";

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          <MapPin className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          {request.pickup_label} <span className="text-zinc-400">→</span> {request.dropoff_label}
        </h1>
        <Badge variant={statusVariant}>{RIDE_REQUEST_STATUS_LABELS[request.status]}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" /> {request.departure_date}{request.departure_time ? ` · ${request.departure_time}` : ""}</span>
        <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {request.passengers} passenger{request.passengers === 1 ? "" : "s"}</span>
        {request.vehicle_type_preference && (
          <span className="flex items-center gap-1"><Car className="h-4 w-4" /> {VEHICLE_TYPE_LABELS[request.vehicle_type_preference]}</span>
        )}
      </div>

      {(request.with_driver_preference !== null || request.budget_min || request.notes) && (
        <Card variant="elevated" className="mt-4 flex flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          {request.with_driver_preference !== null && (
            <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Driver: </span>{request.with_driver_preference ? "With a driver" : "Self-drive"}</p>
          )}
          {request.budget_min && request.budget_max && (
            <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Budget: </span>{formatMoney(request.budget_min)} – {formatMoney(request.budget_max)}</p>
          )}
          {request.notes && <p><span className="font-medium text-zinc-700 dark:text-zinc-300">Notes: </span>{request.notes}</p>}
        </Card>
      )}

      {request.status === "open" && (
        <Button variant="destructive" size="sm" onClick={cancelRequest} className="mt-4">
          Cancel request
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bids ({bids?.length ?? 0})</h2>
        {bidsLoading && <Spinner />}
        {!bidsLoading && (bids ?? []).length === 0 && (
          <div className="mt-2">
            <EmptyState title="No bids yet" description="Check back soon — rent-a-car partners will bid on this request." />
          </div>
        )}
        <div className="mt-3 flex flex-col gap-3">
          {(bids ?? []).map((bid) => (
            <Card key={bid.id} variant="elevated">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{bid.partner.full_name}</h3>
                <span className="text-lg font-semibold text-primary-600 dark:text-primary-400">{formatMoney(bid.price)}</span>
              </div>
              {bid.vehicle && (
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                  <Car className="h-3.5 w-3.5" /> {bid.vehicle.make} {bid.vehicle.model} ({bid.vehicle.year})
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500">{bid.with_driver ? "With a driver" : "Self-drive"}</p>
              {bid.message && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{bid.message}</p>}
              {bid.valid_until && <p className="mt-1 text-xs text-zinc-400">Valid until {new Date(bid.valid_until).toLocaleString()}</p>}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs capitalize text-zinc-400">{RIDE_BID_STATUS_LABELS[bid.status]}</span>
                {bid.status === "pending" && request.status === "open" && (
                  <Button size="sm" onClick={() => acceptBid(bid.id)} loading={busyBidId === bid.id}>
                    Accept &amp; book
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
