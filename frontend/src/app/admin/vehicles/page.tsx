"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import type { VehicleStatus } from "@/types/rentcar";

interface AdminVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  status: VehicleStatus;
  rejection_reason: string | null;
  applicant: { full_name: string; email: string | null; phone: string | null };
}

const TABS: VehicleStatus[] = ["pending_review", "published", "rejected", "draft"];

export default function AdminVehiclesPage() {
  const [tab, setTab] = useState<VehicleStatus>("pending_review");
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["admin-vehicles", tab],
    queryFn: () => apiClient.get<AdminVehicle[]>(`/api/v1/admin/vehicles?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-vehicles"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Vehicle Approvals</h1>

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
      {!isLoading && (vehicles ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No {tab.replace("_", " ")} vehicles.</p>}

      <div className="mt-6 flex flex-col gap-4">
        {(vehicles ?? []).map((vehicle) => (
          <VehicleReviewCard key={vehicle.id} vehicle={vehicle} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function VehicleReviewCard({ vehicle, onChange }: { vehicle: AdminVehicle; onChange: () => void }) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    try {
      await apiClient.post(`/api/v1/admin/vehicles/${vehicle.id}/approve`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await apiClient.post(`/api/v1/admin/vehicles/${vehicle.id}/reject`, { reason: rejectReason }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{vehicle.make} {vehicle.model} ({vehicle.year})</h3>
          <p className="text-xs text-zinc-500">
            by {vehicle.applicant.full_name} ({vehicle.applicant.email})
          </p>
        </div>
        {vehicle.status === "pending_review" && (
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
          <button
            onClick={reject}
            disabled={!rejectReason.trim()}
            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {vehicle.status === "rejected" && vehicle.rejection_reason && (
        <p className="mt-2 text-xs text-red-600">Reason: {vehicle.rejection_reason}</p>
      )}
    </div>
  );
}
