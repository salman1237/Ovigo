"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { BID_STATUS_LABELS, CustomTourRequest, ItineraryDay, TourBid } from "@/types/bidding";

type Tab = "eligible" | "mine";

export default function ExpertBidsPage() {
  const [tab, setTab] = useState<Tab>("eligible");
  const queryClient = useQueryClient();

  const { data: eligible, isLoading: eligibleLoading, isError: eligibleError, error: eligibleErr } = useQuery({
    queryKey: ["bids", "eligible-requests"],
    queryFn: () => apiClient.get<CustomTourRequest[]>("/api/v1/bids/eligible-requests", { auth: true }),
    retry: false,
  });

  const { data: myBids, isLoading: myBidsLoading } = useQuery({
    queryKey: ["bids", "mine"],
    queryFn: () => apiClient.get<TourBid[]>("/api/v1/bids/mine", { auth: true }),
    retry: false,
    enabled: tab === "mine",
  });

  const notEligibleRole = eligibleError && eligibleErr instanceof ApiError && eligibleErr.status === 403;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["bids"] });

  if (notEligibleRole) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Custom Tour Bids</h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Local Experts only. Apply to become one from &quot;Become a Partner&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Custom Tour Bids</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Requests here are filtered to destinations you&apos;re tagged for.
      </p>

      <div className="mt-4 flex gap-2">
        {(["eligible", "mine"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t === "eligible" ? "Open requests" : "My bids"}
          </button>
        ))}
      </div>

      {tab === "eligible" && (
        <div className="mt-6 flex flex-col gap-4">
          {eligibleLoading && <p className="text-sm text-zinc-400">Loading…</p>}
          {!eligibleLoading && (eligible ?? []).length === 0 && (
            <p className="text-sm text-zinc-400">No open requests match your tagged destinations right now.</p>
          )}
          {(eligible ?? []).map((r) => (
            <RequestCard key={r.id} request={r} onBidSubmitted={refetch} />
          ))}
        </div>
      )}

      {tab === "mine" && (
        <div className="mt-6 flex flex-col gap-3">
          {myBidsLoading && <p className="text-sm text-zinc-400">Loading…</p>}
          {!myBidsLoading && (myBids ?? []).length === 0 && (
            <p className="text-sm text-zinc-400">You haven&apos;t placed any bids yet.</p>
          )}
          {(myBids ?? []).map((bid) => (
            <MyBidCard key={bid.id} bid={bid} onChange={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request, onBidSubmitted }: { request: CustomTourRequest; onBidSubmitted: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([{ day_number: 1, title: "", description: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addDay = () =>
    setItinerary((days) => [...days, { day_number: days.length + 1, title: "", description: "" }]);

  const updateDay = (index: number, field: "title" | "description", value: string) =>
    setItinerary((days) => days.map((d, i) => (i === index ? { ...d, [field]: value } : d)));

  const submit = async () => {
    setError(null);
    if (!price || itinerary.some((d) => !d.title.trim())) {
      setError("Add a price and a title for every itinerary day.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        `/api/v1/custom-requests/${request.id}/bids`,
        { price, message: message || undefined, itinerary },
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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{request.title}</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{request.description}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {request.start_date} → {request.end_date} · {request.group_size} traveler(s)
        {request.budget_min && request.budget_max && (
          <> · Budget: {formatMoney(request.budget_min)} – {formatMoney(request.budget_max)}</>
        )}
      </p>

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          Place a bid
        </button>
      )}

      {showForm && (
        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Your price (৳)"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message to the traveler (optional)"
            rows={2}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="text-xs font-medium text-zinc-500">Itinerary</p>
          {itinerary.map((day, i) => (
            <div key={i} className="flex gap-2">
              <span className="mt-2 text-xs text-zinc-400">Day {day.day_number}</span>
              <input
                value={day.title}
                onChange={(e) => updateDay(i, "title", e.target.value)}
                placeholder="Title"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                value={day.description ?? ""}
                onChange={(e) => updateDay(i, "description", e.target.value)}
                placeholder="Details (optional)"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
          ))}
          <button onClick={addDay} type="button" className="self-start text-xs text-zinc-500 underline">
            + Add another day
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              Submit bid
            </button>
            <button onClick={() => setShowForm(false)} className="text-xs text-zinc-500">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MyBidCard({ bid, onChange }: { bid: TourBid; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/bids/${bid.id}/withdraw`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to withdraw");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(bid.price)}</span>
        <span className="text-xs capitalize text-zinc-500">{BID_STATUS_LABELS[bid.status]}</span>
      </div>
      {bid.message && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{bid.message}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {bid.status === "pending" && (
        <button
          onClick={withdraw}
          disabled={busy}
          className="mt-2 rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
        >
          Withdraw
        </button>
      )}
    </div>
  );
}
