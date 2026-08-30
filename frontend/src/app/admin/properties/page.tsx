"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
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
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (properties ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No {tab.replace("_", " ")} properties.</p>}

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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{property.name}</h3>
          <p className="text-xs text-zinc-500">
            by {property.applicant.full_name} ({property.applicant.email})
          </p>
        </div>
        {property.status === "pending_review" && (
          <div className="flex gap-2">
            <button onClick={approve} className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
              Approve
            </button>
            <button
              onClick={() => setShowReject((s) => !s)}
              className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
            >
              Reject
            </button>
          </div>
        )}
      </div>
      {showReject && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button onClick={reject} disabled={!rejectReason.trim()} className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            Confirm
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
