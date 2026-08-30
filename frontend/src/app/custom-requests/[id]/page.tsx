"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import {
  BID_STATUS_LABELS,
  BidWithBooking,
  CustomTourRequest,
  REQUEST_STATUS_LABELS,
  TourBid,
} from "@/types/bidding";

export default function CustomRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);

  const { data: request, isLoading } = useQuery({
    queryKey: ["custom-requests", id],
    queryFn: () => apiClient.get<CustomTourRequest>(`/api/v1/custom-requests/${id}`, { auth: true }),
  });

  const { data: bids, isLoading: bidsLoading } = useQuery({
    queryKey: ["custom-requests", id, "bids"],
    queryFn: () => apiClient.get<TourBid[]>(`/api/v1/custom-requests/${id}/bids`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["custom-requests", id] });

  const cancelRequest = async () => {
    setError(null);
    try {
      await apiClient.post(`/api/v1/custom-requests/${id}/cancel`, undefined, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    }
  };

  const acceptBid = async (bidId: string) => {
    setError(null);
    setBusyBidId(bidId);
    try {
      const result = await apiClient.post<BidWithBooking>(
        `/api/v1/custom-requests/${id}/bids/${bidId}/accept`,
        undefined,
        { auth: true }
      );
      router.push(`/bookings/${result.booking_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept bid");
      setBusyBidId(null);
    }
  };

  if (isLoading || !request) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{request.title}</h1>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {REQUEST_STATUS_LABELS[request.status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{request.description}</p>
      <p className="mt-2 text-xs text-zinc-500">
        {request.start_date} → {request.end_date} · {request.group_size} traveler(s)
        {request.budget_min && request.budget_max && (
          <> · Budget: {formatMoney(request.budget_min)} – {formatMoney(request.budget_max)}</>
        )}
      </p>

      {request.status === "open" && (
        <button
          onClick={cancelRequest}
          className="mt-4 rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
        >
          Cancel request
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Bids ({bids?.length ?? 0})
        </h2>
        {bidsLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
        {!bidsLoading && (bids ?? []).length === 0 && (
          <p className="mt-2 text-sm text-zinc-400">No bids yet — check back soon.</p>
        )}
        <div className="mt-3 flex flex-col gap-3">
          {(bids ?? []).map((bid) => (
            <div key={bid.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{bid.expert.full_name}</h3>
                <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatMoney(bid.price)}
                </span>
              </div>
              {bid.message && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{bid.message}</p>}
              {bid.itinerary.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-500">
                  {bid.itinerary.map((day) => (
                    <li key={day.day_number}>
                      <span className="font-medium">Day {day.day_number}:</span> {day.title}
                      {day.description && ` — ${day.description}`}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs capitalize text-zinc-400">{BID_STATUS_LABELS[bid.status]}</span>
                {bid.status === "pending" && request.status === "open" && (
                  <button
                    onClick={() => acceptBid(bid.id)}
                    disabled={busyBidId === bid.id}
                    className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Accept &amp; book
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
