"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
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
import { AdCampaign, AdEntityType, PLACEMENT_LABELS } from "@/types/ads";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  pending_review: "warning",
  active: "success",
  paused: "neutral",
  rejected: "danger",
  completed: "primary",
};

interface Advertisable {
  id: string;
  title: string;
  status: string;
}

export default function DashboardAdsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [entityType, setEntityType] = useState<AdEntityType>("tour");
  const [entityId, setEntityId] = useState("");
  const [placementType, setPlacementType] = useState("sponsored");
  const [billingModel, setBillingModel] = useState<"cpc" | "cpm">("cpc");
  const [bidAmount, setBidAmount] = useState("");
  const [budgetTotal, setBudgetTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: campaigns, isLoading, isError, error: fetchError } = useQuery({
    queryKey: ["ads", "mine"],
    queryFn: () => apiClient.get<AdCampaign[]>("/api/v1/ads/campaigns/mine", { auth: true }),
    enabled: !!user,
    retry: false,
  });

  const { data: tours } = useQuery({
    queryKey: ["tours", "mine"],
    queryFn: () => apiClient.get<Advertisable[]>("/api/v1/tours/mine", { auth: true }),
    enabled: !!user,
    retry: false,
  });
  const { data: properties } = useQuery({
    queryKey: ["properties", "mine-list"],
    queryFn: () => apiClient.get<{ id: string; name: string; status: string }[]>("/api/v1/properties/mine", { auth: true }),
    enabled: !!user,
    retry: false,
  });
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", "mine-list"],
    queryFn: () => apiClient.get<{ id: string; make: string; model: string; status: string }[]>("/api/v1/vehicles/mine", { auth: true }),
    enabled: !!user,
    retry: false,
  });

  const notEligible = isError && fetchError instanceof ApiError && fetchError.status === 403;

  const advertisableOptions: Advertisable[] =
    entityType === "tour"
      ? (tours ?? []).filter((t) => t.status === "published").map((t) => ({ id: t.id, title: t.title, status: t.status }))
      : entityType === "property"
        ? (properties ?? []).filter((p) => p.status === "published").map((p) => ({ id: p.id, title: p.name, status: p.status }))
        : (vehicles ?? []).filter((v) => v.status === "published").map((v) => ({ id: v.id, title: `${v.make} ${v.model}`, status: v.status }));

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!entityId) {
      setError("Choose a published listing to advertise.");
      return;
    }
    setSubmitting(true);
    try {
      const campaign = await apiClient.post<AdCampaign>(
        "/api/v1/ads/campaigns",
        {
          entity_type: entityType,
          entity_id: entityId,
          placement_type: placementType,
          billing_model: billingModel,
          bid_amount: bidAmount,
          budget_total: budgetTotal,
        },
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["ads", "mine"] });
      router.push(`/dashboard/ads/${campaign.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">Sign in as an approved partner to advertise your listings.</p>
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
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ad Campaigns</h1>
        <p className="mt-4 text-sm text-zinc-500">
          This is for approved Local Experts, Hosts and Rent-a-Car partners only. Apply at{" "}
          <Link href="/account/partner" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Become a Partner
          </Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ad Campaigns</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Promote one of your published listings in search results, targeted by destination. Every campaign is
        reviewed by our team before it goes live.
      </p>

      <Card as="form" onSubmit={createCampaign} className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">New campaign</h2>
        <div className="flex flex-wrap gap-3">
          <Select
            label="What are you advertising?"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value as AdEntityType);
              setEntityId("");
            }}
            className="w-auto"
          >
            <option value="tour">A Tour</option>
            <option value="property">A Property</option>
            <option value="vehicle">A Vehicle</option>
          </Select>
          <Select label="Which listing" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="min-w-48 flex-1">
            <option value="">Select a published listing…</option>
            {advertisableOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </div>
        {advertisableOptions.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            You don&apos;t have a published listing of this type yet — publish one first before advertising it.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Select label="Placement" value={placementType} onChange={(e) => setPlacementType(e.target.value)} className="w-auto">
            {Object.entries(PLACEMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select label="Billing model" value={billingModel} onChange={(e) => setBillingModel(e.target.value as "cpc" | "cpm")} className="w-auto">
            <option value="cpc">Cost per click</option>
            <option value="cpm">Cost per 1,000 impressions</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-3">
          <Input
            type="number"
            label={billingModel === "cpc" ? "Bid per click (৳)" : "Bid per 1,000 impressions (৳)"}
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            required
            className="w-48"
          />
          <Input type="number" label="Total budget (৳)" value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} required className="w-40" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={submitting} className="self-start">
          {submitting ? "Creating…" : "Create draft campaign"}
        </Button>
      </Card>

      {isLoading && <Spinner />}
      {!isLoading && (campaigns ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Create your first ad campaign above." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(campaigns ?? []).map((c) => (
          <Link key={c.id} href={`/dashboard/ads/${c.id}`}>
            <Card hoverable className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{c.entity_title}</p>
                <p className="text-xs text-zinc-500">
                  {PLACEMENT_LABELS[c.placement_type]} · {c.billing_model.toUpperCase()} · {formatMoney(c.budget_spent)} / {formatMoney(c.budget_total)} spent
                </p>
              </div>
              <Badge variant={STATUS_VARIANTS[c.status]} className="capitalize">
                {c.status.replace("_", " ")}
              </Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
