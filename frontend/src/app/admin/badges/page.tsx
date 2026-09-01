"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { AdminBadge, BADGE_TYPE_LABELS, BadgeStatus } from "@/types/badges";

const TABS: BadgeStatus[] = ["pending", "approved", "rejected"];

export default function AdminBadgesPage() {
  const [tab, setTab] = useState<BadgeStatus>("pending");
  const queryClient = useQueryClient();

  const { data: badges, isLoading } = useQuery({
    queryKey: ["admin-badges", tab],
    queryFn: () => apiClient.get<AdminBadge[]>(`/api/v1/admin/badges?status=${tab}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-badges"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Trust Badges</h1>

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
      {!isLoading && (badges ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No {tab} applications.</p>}

      <div className="mt-6 flex flex-col gap-4">
        {(badges ?? []).map((b) => (
          <BadgeCard key={b.id} badge={b} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function BadgeCard({ badge, onChange }: { badge: AdminBadge; onChange: () => void }) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/badges/${badge.id}/approve`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/badges/${badge.id}/reject`, { reason }, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{BADGE_TYPE_LABELS[badge.badge_type]}</h3>
          <p className="text-xs text-zinc-500 capitalize">
            {badge.entity_type} · {badge.entity_id.slice(0, 8)}
          </p>
        </div>
        {badge.status === "pending" && (
          <div className="flex gap-2">
            <button
              onClick={approve}
              disabled={busy}
              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => setShowReject((s) => !s)}
              disabled={busy}
              className="rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {badge.private_note && (
        <p className="mt-2 rounded-md bg-zinc-50 p-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="font-medium">Applicant&apos;s note (private):</span> {badge.private_note}
        </p>
      )}
      {badge.rejection_reason && <p className="mt-2 text-xs text-red-600">Rejected: {badge.rejection_reason}</p>}

      {showReject && (
        <div className="mt-3 flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={reject}
            disabled={busy || !reason.trim()}
            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
