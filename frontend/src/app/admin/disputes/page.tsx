"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
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
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (disputes ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title={`No ${tab === "all" ? "" : tab} disputes`} />
        </div>
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
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {dispute.raised_by.full_name}
            <Badge className="ml-2 text-[10px]">{dispute.raised_by_role}</Badge>
          </h3>
          <p className="text-xs text-zinc-500">
            {dispute.raised_by.email} · Booking {dispute.booking_id.slice(0, 8)} ·{" "}
            {new Date(dispute.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={dispute.status === "open" ? "warning" : "success"} className="capitalize">
          {dispute.status}
        </Badge>
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
            <Button size="sm" onClick={() => setShowResolve(true)}>
              Resolve
            </Button>
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
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note (shown to the traveler)" rows={2} />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={resolve} loading={busy}>
                  Confirm resolution
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowResolve(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
