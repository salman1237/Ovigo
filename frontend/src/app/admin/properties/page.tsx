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
import type { PropertyStatus } from "@/types/stay";

interface AdminProperty {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: PropertyStatus;
  rejection_reason: string | null;
  applicant: { full_name: string; email: string | null; phone: string | null };
}

const TABS: PropertyStatus[] = ["pending_review", "published", "rejected", "draft"];

export default function AdminPropertiesPage() {
  const [tab, setTab] = useState<PropertyStatus>("pending_review");
  const queryClient = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ["admin-properties", tab],
    queryFn: () => apiClient.get<AdminProperty[]>(`/api/v1/admin/properties?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-properties"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Property Approvals</h1>

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
      {!isLoading && (properties ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab.replace("_", " ")} properties`} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(properties ?? []).map((prop) => (
          <PropertyReviewCard key={prop.id} property={prop} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function PropertyReviewCard({ property, onChange }: { property: AdminProperty; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    try {
      await apiClient.post(`/api/v1/admin/properties/${property.id}/approve`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/properties/${property.id}/reject`, { reason: rejectReason }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{property.name}</h3>
          <p className="text-xs text-zinc-500">
            by {property.applicant.full_name} ({property.applicant.email})
          </p>
        </div>
        {property.status === "pending_review" && (
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
