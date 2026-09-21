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
                  {r.start_date} → {r.end_date} · {r.adults} adult{r.adults === 1 ? "" : "s"}
                  {r.children > 0 ? `, ${r.children} child${r.children === 1 ? "" : "ren"}` : ""}
                  {r.infants > 0 ? `, ${r.infants} infant${r.infants === 1 ? "" : "s"}` : ""} ·{" "}
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
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [foodPreference, setFoodPreference] = useState("");
  const [accessibilityNeeds, setAccessibilityNeeds] = useState("");
  const [safetyPrivacyNotes, setSafetyPrivacyNotes] = useState("");
  const [guideRequested, setGuideRequested] = useState(false);
  const [specialOccasion, setSpecialOccasion] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [bidDeadline, setBidDeadline] = useState("");
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
          adults,
          children,
          infants,
          budget_min: budgetMin || undefined,
          budget_max: budgetMax || undefined,
          location_id: location.id,
          pickup_location: pickupLocation || undefined,
          food_preference: foodPreference || undefined,
          accessibility_needs: accessibilityNeeds || undefined,
          safety_privacy_notes: safetyPrivacyNotes || undefined,
          guide_requested: guideRequested,
          special_occasion: specialOccasion || undefined,
          additional_notes: additionalNotes || undefined,
          bid_deadline: bidDeadline || undefined,
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
        <Input type="number" label="Adults" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
        <Input type="number" label="Children" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
        <Input type="number" label="Infants" min={0} value={infants} onChange={(e) => setInfants(Number(e.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input type="number" label="Budget min (optional)" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
        <Input type="number" label="Budget max (optional)" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
      </div>
      {budgetMin && budgetMax && (
        <p className="text-xs text-zinc-400">
          Budget range: {formatMoney(budgetMin)} – {formatMoney(budgetMax)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label="Pickup location (optional)" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} />
        <Input label="Special occasion (optional)" value={specialOccasion} onChange={(e) => setSpecialOccasion(e.target.value)} placeholder="e.g. honeymoon" />
      </div>
      <Textarea label="Food preference (optional)" value={foodPreference} onChange={(e) => setFoodPreference(e.target.value)} rows={2} />
      <Textarea label="Accessibility needs (optional)" value={accessibilityNeeds} onChange={(e) => setAccessibilityNeeds(e.target.value)} rows={2} />
      <Textarea label="Safety / privacy notes (optional)" value={safetyPrivacyNotes} onChange={(e) => setSafetyPrivacyNotes(e.target.value)} rows={2} />
      <Textarea label="Additional notes (optional)" value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} rows={2} />
      <div className="grid grid-cols-2 gap-3 sm:items-end">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={guideRequested} onChange={(e) => setGuideRequested(e.target.checked)} className="rounded border-zinc-300" />
          A guide is needed
        </label>
        <Input type="date" label="Bid deadline (optional)" value={bidDeadline} onChange={(e) => setBidDeadline(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!title || !description || !startDate || !endDate} className="self-start">
        Post request
      </Button>
    </Card>
  );
}
