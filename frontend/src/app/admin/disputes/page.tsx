"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { Dispute, DisputeResolution, DisputeStatus } from "@/types/dispute";

const TABS: (DisputeStatus | "all")[] = ["all", "open", "resolved"];

export default function AdminDisputesPage() {
  const [tab, setTab] = useState<DisputeStatus | "all">("open");
  const queryClient = useQueryClient();

  const { data: disputes, isLoading } = useQuery({
    queryKey: ["admin-disputes", tab],
    queryFn: () =>
      apiClient.get<Dispute[]>(`/api/v1/admin/disputes${tab === "all" ? "" : `?status=${tab}`}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-disputes"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Disputes</h1>

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
            {t}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (disputes ?? []).length === 0 && (
        <p className="mt-6 text-sm text-zinc-400">No {tab === "all" ? "" : tab} disputes.</p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(disputes ?? []).map((d) => (
          <DisputeCard key={d.id} dispute={d} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function DisputeCard({ dispute, onChange }: { dispute: Dispute; onChange: () => void }) {
  const [showResolve, setShowResolve] = useState(false);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState<DisputeResolution>("refunded");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resolve = async () => {
    if (!note.trim()) {
      setError("Please add a note explaining the resolution.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/disputes/${dispute.id}/resolve`, { resolution, note }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resolve dispute");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{dispute.raised_by.full_name}</h3>
          <p className="text-xs text-zinc-500">
            {dispute.raised_by.email} · Booking {dispute.booking_id.slice(0, 8)} ·{" "}
            {new Date(dispute.created_at).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
            dispute.status === "open"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {dispute.status}
        </span>
      </div>

      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{dispute.reason}</p>

      {dispute.status === "resolved" && (
        <p className="mt-2 text-xs text-zinc-500">
          Resolved as <span className="font-medium capitalize">{dispute.resolution}</span>: {dispute.resolution_note}
        </p>
      )}

      {dispute.status === "open" && (
        <div className="mt-3">
          {!showResolve && (
            <button
              onClick={() => setShowResolve(true)}
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900"
            >
              Resolve
            </button>
          )}
          {showResolve && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    checked={resolution === "refunded"}
                    onChange={() => setResolution("refunded")}
                  />
                  Refund
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    checked={resolution === "rejected"}
                    onChange={() => setResolution("rejected")}
                  />
                  Reject
                </label>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Resolution note (shown to the traveler)"
                rows={2}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={resolve}
                  disabled={busy}
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  Confirm resolution
                </button>
                <button onClick={() => setShowResolve(false)} className="text-xs text-zinc-500">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
