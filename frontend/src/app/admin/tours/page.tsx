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
import type { TourStatus } from "@/types/tour";

interface AdminTour {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  duration_days: number;
  status: TourStatus;
  rejection_reason: string | null;
  applicant: { full_name: string; email: string | null; phone: string | null };
}

const TABS: TourStatus[] = ["pending_review", "published", "rejected", "draft"];

export default function AdminToursPage() {
  const [tab, setTab] = useState<TourStatus>("pending_review");
  const queryClient = useQueryClient();

  const { data: tours, isLoading } = useQuery({
    queryKey: ["admin-tours", tab],
    queryFn: () => apiClient.get<AdminTour[]>(`/api/v1/admin/tours?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-tours"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Tour Approvals</h1>

      <div className="mt-4 flex gap-2">
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
      {!isLoading && (tours ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab.replace("_", " ")} tours`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(tours ?? []).map((tour) => (
          <TourReviewCard key={tour.id} tour={tour} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function TourReviewCard({ tour, onChange }: { tour: AdminTour; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    try {
      await apiClient.post(`/api/v1/admin/tours/${tour.id}/approve`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/tours/${tour.id}/reject`, { reason: rejectReason }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{tour.title}</h3>
          <p className="text-xs text-zinc-500">
            {tour.duration_days} days · by {tour.applicant.full_name} ({tour.applicant.email})
          </p>
        </div>
        {tour.status === "pending_review" && (
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
    </Card>
  );
}
