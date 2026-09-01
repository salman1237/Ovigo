"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Payout, PayoutPreviewRow } from "@/types/earnings";

export default function AdminPayoutsPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payouts</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Running a batch sweeps every currently-payable commission into a payout per partner. There is
        no real bank transfer behind this yet — a payout is marked paid immediately.
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-zinc-900 dark:text-zinc-50">Pending Batch Preview</h2>
          <button
            onClick={runBatch}
            disabled={busy || (preview ?? []).length === 0}
            className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Run payout batch
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {previewLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
        {!previewLoading && (preview ?? []).length === 0 && (
          <p className="mt-2 text-sm text-zinc-400">Nothing payable right now.</p>
        )}
        {(preview ?? []).length > 0 && (
          <>
            <div className="mt-3 flex flex-col gap-1">
              {(preview ?? []).map((p) => (
                <div key={p.partner_role_id} className="flex items-center justify-between text-sm">
                  <span>{p.partner_name} · {p.commission_count} commission(s)</span>
                  <span className="font-medium">{formatMoney(p.total_amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-zinc-500">Total: {formatMoney(totalPreview.toFixed(2))}</p>
          </>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Payout History</h2>
        {historyLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
        {!historyLoading && (history ?? []).length === 0 && (
          <p className="mt-2 text-sm text-zinc-400">No payouts have been run yet.</p>
        )}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
                <th className="py-2 pr-4">Partner</th>
                <th className="py-2 pr-4">Commissions</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Paid at</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-2.5 pr-4 font-mono text-xs">{p.partner_role_id.slice(0, 8)}</td>
                  <td className="py-2.5 pr-4">{p.commission_count}</td>
                  <td className="py-2.5 pr-4">{formatMoney(p.total_amount)}</td>
                  <td className="py-2.5 pr-4 text-xs text-zinc-500">{new Date(p.paid_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
