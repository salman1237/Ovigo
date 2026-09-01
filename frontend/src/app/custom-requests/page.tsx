"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import { CustomTourRequest, REQUEST_STATUS_LABELS } from "@/types/bidding";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  open: "success",
  closed: "primary",
  cancelled: "neutral",
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
        <Button size="sm" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New request"}
        </Button>
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

      {isLoading && <Spinner />}
      {!isLoading && (requests ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No requests yet" description="Post a custom trip request above to get bids from Local Experts." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(requests ?? []).map((r) => (
          <Link key={r.id} href={`/custom-requests/${r.id}`}>
            <Card hoverable className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{r.title}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {r.start_date} → {r.end_date} · {r.group_size} traveler(s) ·{" "}
                  {r.bid_count} bid{r.bid_count === 1 ? "" : "s"}
                </p>
              </div>
              <Badge variant={STATUS_VARIANTS[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Badge>
            </Card>
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
    <Card className="mt-4 flex flex-col gap-3">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Trip title (e.g. 5-day Sundarbans family trip)" />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what you're looking for…" rows={3} />
      <div>
        <Input value={location ? location.name : query} onChange={(e) => search(e.target.value)} placeholder="Destination" />
        {results.length > 0 && !location && (
          <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {results.map((loc) => (
              <li key={loc.id}>
                <button
                  type="button"
                  onClick={() => {
                    setLocation(loc);
                    setResults([]);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-950/40"
                >
                  {loc.name} <span className="text-xs text-zinc-400">({loc.type})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input type="date" label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input type="date" label="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input type="number" label="Group size" min={1} value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />
        <Input type="number" label="Budget min (optional)" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
        <Input type="number" label="Budget max (optional)" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
      </div>
      {budgetMin && budgetMax && (
        <p className="text-xs text-zinc-400">
          Budget range: {formatMoney(budgetMin)} – {formatMoney(budgetMax)}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!title || !description || !startDate || !endDate} className="self-start">
        Post request
      </Button>
    </Card>
  );
}
