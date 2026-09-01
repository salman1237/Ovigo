"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { LocationPicker } from "@/components/shared/LocationPicker";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import { AdCampaign, AdCampaignStats, PLACEMENT_LABELS } from "@/types/ads";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  pending_review: "warning",
  active: "success",
  paused: "neutral",
  rejected: "danger",
  completed: "primary",
};

export default function AdCampaignEditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["ads", "campaign", id],
    queryFn: () => apiClient.get<AdCampaign>(`/api/v1/ads/campaigns/${id}`, { auth: true }),
  });

  const { data: stats } = useQuery({
    queryKey: ["ads", "campaign", id, "stats"],
    queryFn: () => apiClient.get<AdCampaignStats>(`/api/v1/ads/campaigns/${id}/stats`, { auth: true }),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["ads", "campaign", id] });
    queryClient.invalidateQueries({ queryKey: ["ads", "mine"] });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !campaign) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{campaign.entity_title}</h1>
          <p className="text-sm text-zinc-500">
            {PLACEMENT_LABELS[campaign.placement_type]} · {campaign.billing_model.toUpperCase()} · {formatMoney(campaign.bid_amount)}
            {campaign.billing_model === "cpc" ? "/click" : "/1,000 impressions"}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[campaign.status]} className="capitalize">
          {campaign.status.replace("_", " ")}
        </Badge>
      </div>

      {campaign.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Rejected: {campaign.rejection_reason}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {(campaign.status === "draft" || campaign.status === "rejected") && (
          <Button size="sm" onClick={() => run(() => apiClient.post(`/api/v1/ads/campaigns/${id}/submit`, undefined, { auth: true }))}>
            Submit for review
          </Button>
        )}
        {campaign.status === "active" && (
          <Button size="sm" variant="secondary" onClick={() => run(() => apiClient.post(`/api/v1/ads/campaigns/${id}/pause`, undefined, { auth: true }))}>
            Pause
          </Button>
        )}
        {campaign.status === "paused" && (
          <Button size="sm" onClick={() => run(() => apiClient.post(`/api/v1/ads/campaigns/${id}/resume`, undefined, { auth: true }))}>
            Resume
          </Button>
        )}
      </div>

      {stats && (
        <Card className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Performance</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Impressions" value={String(stats.impressions_count)} />
            <Stat label="Clicks" value={String(stats.clicks_count)} />
            <Stat label="CTR" value={`${(stats.click_through_rate * 100).toFixed(2)}%`} />
            <Stat label="Spent" value={formatMoney(stats.budget_spent)} highlight />
          </div>
        </Card>
      )}

      <BudgetSection campaign={campaign} onChange={refetch} />

      <Card className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Destinations</h2>
        <LocationsSection campaignId={id} run={run} />
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-primary-600 dark:text-primary-400" : "text-zinc-900 dark:text-zinc-50"}`}>{value}</p>
    </div>
  );
}

function BudgetSection({ campaign, onChange }: { campaign: AdCampaign; onChange: () => void }) {
  const [bidAmount, setBidAmount] = useState(campaign.bid_amount);
  const [budgetTotal, setBudgetTotal] = useState(campaign.budget_total);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiClient.put(`/api/v1/ads/campaigns/${campaign.id}`, { bid_amount: bidAmount, budget_total: budgetTotal }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bid &amp; Budget</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Input
          type="number"
          label={campaign.billing_model === "cpc" ? "Bid per click (৳)" : "Bid per 1,000 impressions (৳)"}
          value={bidAmount}
          onChange={(e) => setBidAmount(e.target.value)}
          className="w-48"
        />
        <Input type="number" label="Total budget (৳)" value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} className="w-40" />
        <Button size="sm" variant="secondary" onClick={save} loading={saving}>
          Save
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Spent so far: {formatMoney(campaign.budget_spent)} of {formatMoney(campaign.budget_total)}
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </Card>
  );
}

function LocationsSection({ campaignId, run }: { campaignId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <div className="mt-3">
      <LocationPicker selected={locations} onChange={setLocations} />
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          run(() =>
            apiClient.post(`/api/v1/ads/campaigns/${campaignId}/locations`, { location_ids: locations.map((l) => l.id) }, { auth: true })
          )
        }
        disabled={locations.length === 0}
        className="mt-2"
      >
        Save destinations
      </Button>
    </div>
  );
}
