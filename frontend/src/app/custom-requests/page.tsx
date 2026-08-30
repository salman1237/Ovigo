"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import { CustomTourRequest, REQUEST_STATUS_LABELS } from "@/types/bidding";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  closed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function CustomRequestsPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["custom-requests", "mine"],
    queryFn: () => apiClient.get<CustomTourRequest[]>("/api/v1/custom-requests", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["custom-requests"] });

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Custom Tour Requests</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          {showForm ? "Cancel" : "New request"}
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Describe the trip you want and let Local Experts bid with their own itinerary and price.
      </p>

      {showForm && (
        <RequestForm
          onCreated={() => {
            setShowForm(false);
            refetch();
          }}
        />
      )}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (requests ?? []).length === 0 && (
        <p className="mt-6 text-sm text-zinc-400">You haven&apos;t posted any custom tour requests yet.</p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(requests ?? []).map((r) => (
          <Link
            key={r.id}
            href={`/custom-requests/${r.id}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{r.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">
                {r.start_date} → {r.end_date} · {r.group_size} traveler(s) ·{" "}
                {r.bid_count} bid{r.bid_count === 1 ? "" : "s"}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}>
              {REQUEST_STATUS_LABELS[r.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RequestForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    setLocation(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const found = await apiClient.get<Location[]>(`/api/v1/locations/search?q=${encodeURIComponent(q)}`);
    setResults(found);
  };

  const submit = async () => {
    setError(null);
    if (!location) {
      setError("Please pick a destination.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post(
        "/api/v1/custom-requests",
        {
          title,
          description,
          start_date: startDate,
          end_date: endDate,
          group_size: groupSize,
          budget_min: budgetMin || undefined,
          budget_max: budgetMax || undefined,
          location_id: location.id,
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
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Trip title (e.g. 5-day Sundarbans family trip)"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe what you're looking for…"
        rows={3}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div>
        <input
          value={location ? location.name : query}
          onChange={(e) => search(e.target.value)}
          placeholder="Destination"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {results.length > 0 && !location && (
          <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
            {results.map((loc) => (
              <li key={loc.id}>
                <button
                  type="button"
                  onClick={() => {
                    setLocation(loc);
                    setResults([]);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  {loc.name} <span className="text-xs text-zinc-400">({loc.type})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-zinc-500">
          Start date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-xs text-zinc-500">
          End date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs text-zinc-500">
          Group size
          <input
            type="number"
            min={1}
            value={groupSize}
            onChange={(e) => setGroupSize(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Budget min (optional)
          <input
            type="number"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Budget max (optional)
          <input
            type="number"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </div>
      {budgetMin && budgetMax && (
        <p className="text-xs text-zinc-400">
          Budget range: {formatMoney(budgetMin)} – {formatMoney(budgetMax)}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !title || !description || !startDate || !endDate}
        className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        Post request
      </button>
    </div>
  );
}
