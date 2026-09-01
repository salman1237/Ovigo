"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { AdCampaignStatus, AdminAdCampaign, PLACEMENT_LABELS } from "@/types/ads";

const TABS: AdCampaignStatus[] = ["pending_review", "active", "paused", "rejected", "completed", "draft"];

export default function AdminAdsPage() {
  const [tab, setTab] = useState<AdCampaignStatus>("pending_review");
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["admin-ads", tab],
    queryFn: () => apiClient.get<AdminAdCampaign[]>(`/api/v1/admin/ads/campaigns?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-ads"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ad Campaigns</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (campaigns ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab.replace("_", " ")} campaigns`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(campaigns ?? []).map((c) => (
          <CampaignReviewCard key={c.id} campaign={c} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function CampaignReviewCard({ campaign, onChange }: { campaign: AdminAdCampaign; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    try {
      await apiClient.post(`/api/v1/admin/ads/campaigns/${campaign.id}/approve`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/ads/campaigns/${campaign.id}/reject`, { reason: rejectReason }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {campaign.entity_title} <span className="text-xs font-normal capitalize text-zinc-400">({campaign.entity_type})</span>
          </h3>
          <p className="text-xs text-zinc-500">
            by {campaign.applicant.full_name} ({campaign.applicant.email}) · {PLACEMENT_LABELS[campaign.placement_type]} ·{" "}
            {campaign.billing_model.toUpperCase()} {formatMoney(campaign.bid_amount)} · Budget {formatMoney(campaign.budget_total)}
          </p>
        </div>
        {campaign.status === "pending_review" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={approve}>
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowReject((s) => !s)}>
              Reject
            </Button>
          </div>
        )}
      </div>

      {showReject && (
        <div className="mt-3 flex gap-2">
          <Input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason" className="flex-1" />
          <Button size="sm" variant="destructive" onClick={reject} disabled={!rejectReason.trim()}>
            Confirm
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {campaign.status === "rejected" && campaign.rejection_reason && (
        <p className="mt-2 text-xs text-red-600">Reason: {campaign.rejection_reason}</p>
      )}
    </Card>
  );
}
