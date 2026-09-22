"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Payout, PayoutPreviewRow, PayoutStatus } from "@/types/earnings";

const STATUS_BADGE: Record<PayoutStatus, { label: string; variant: "neutral" | "primary" | "success" | "warning" | "danger" }> = {
  pending: { label: "Pending", variant: "neutral" },
  processing: { label: "Processing", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  reversed: { label: "Reversed", variant: "danger" },
};

// What an admin may move a payout to from its current status — mirrors
// backend/app/modules/payouts/service.py's _ALLOWED_TRANSITIONS exactly.
const NEXT_STATUSES: Record<PayoutStatus, PayoutStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["paid", "failed"],
  paid: ["reversed"],
  failed: [],
  reversed: [],
};

export default function AdminPayoutsPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["admin-payouts", "preview"],
    queryFn: () => apiClient.get<PayoutPreviewRow[]>("/api/v1/admin/payouts/preview", { auth: true }),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["admin-payouts", "history"],
    queryFn: () => apiClient.get<Payout[]>("/api/v1/admin/payouts", { auth: true }),
  });

  const runBatch = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post("/api/v1/admin/payouts/run", undefined, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to run payout batch");
    } finally {
      setBusy(false);
    }
  };

  const totalPreview = (preview ?? []).reduce((sum, p) => sum + Number(p.total_amount), 0);

  const updateStatus = async (payoutId: string, status: PayoutStatus) => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.put(
        `/api/v1/admin/payouts/${payoutId}/status`,
        { status, reference: reference || null, note: note || null },
        { auth: true }
      );
      setEditingId(null);
      setReference("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update payout status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payouts</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Running a batch sweeps every currently-payable commission into a PENDING payout per partner.
        There is no real bank transfer behind this yet — walk each payout through Processing → Paid
        once you&apos;ve sent the transfer out of band, or mark it Failed/Reversed if it didn&apos;t
        land; either way its commissions return to payable for the next batch.
      </p>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Pending Batch Preview</h2>
          <Button size="sm" onClick={runBatch} loading={busy} disabled={(preview ?? []).length === 0}>
            Run payout batch
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {previewLoading && <Spinner />}
        {!previewLoading && (preview ?? []).length === 0 && (
          <p className="mt-2 text-sm text-zinc-400">Nothing payable right now.</p>
        )}
        {(preview ?? []).length > 0 && (
          <>
            <div className="mt-3 flex flex-col gap-1">
              {(preview ?? []).map((p) => (
                <div key={p.partner_role_id} className="flex items-center justify-between text-sm">
                  <span>{p.partner_name} · {p.commission_count} commission(s)</span>
                  <span className="font-medium text-primary-600 dark:text-primary-400">{formatMoney(p.total_amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">Total: {formatMoney(totalPreview.toFixed(2))}</p>
          </>
        )}
      </Card>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Payout History</h2>
        {historyLoading && <Spinner />}
        {!historyLoading && (history ?? []).length === 0 && (
          <p className="mt-2 text-sm text-zinc-400">No payouts have been run yet.</p>
        )}
        {(history ?? []).length > 0 && (
          <Card className="mt-2 overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
                  <th className="py-3 pl-4 pr-4">Partner</th>
                  <th className="py-3 pr-4">Commissions</th>
                  <th className="py-3 pr-4">Amount</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Reference</th>
                  <th className="py-3 pr-4">Paid at</th>
                  <th className="py-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {(history ?? []).map((p) => {
                  const badge = STATUS_BADGE[p.status];
                  const nextOptions = NEXT_STATUSES[p.status];
                  return (
                    <tr key={p.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                      <td className="py-2.5 pl-4 pr-4 font-mono text-xs">{p.partner_role_id.slice(0, 8)}</td>
                      <td className="py-2.5 pr-4">{p.commission_count}</td>
                      <td className="py-2.5 pr-4 font-medium text-primary-600 dark:text-primary-400">{formatMoney(p.total_amount)}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {p.note && <p className="mt-1 max-w-[180px] text-[11px] text-zinc-400">{p.note}</p>}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-zinc-500">{p.reference ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-xs text-zinc-500">
                        {p.paid_at ? new Date(p.paid_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        {nextOptions.length > 0 && editingId !== p.id && (
                          <Button size="sm" variant="secondary" onClick={() => setEditingId(p.id)}>
                            Update
                          </Button>
                        )}
                        {editingId === p.id && (
                          <div className="flex flex-col gap-2 py-1">
                            <input
                              value={reference}
                              onChange={(e) => setReference(e.target.value)}
                              placeholder="Reference (optional)"
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <input
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              placeholder="Note (optional)"
                              className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <div className="flex flex-wrap gap-1.5">
                              {nextOptions.map((status) => (
                                <Button
                                  key={status}
                                  size="sm"
                                  variant={status === "failed" || status === "reversed" ? "destructive" : "primary"}
                                  loading={busy}
                                  onClick={() => updateStatus(p.id, status)}
                                >
                                  Mark {STATUS_BADGE[status].label}
                                </Button>
                              ))}
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
