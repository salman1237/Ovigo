"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { AdminPayment, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/admin-overview";

interface BankTransferPayment {
  id: string;
  booking_id: string;
  tran_id: string;
  amount: string;
  currency: string;
  bank_reference: string | null;
  created_at: string;
}

const TABS: (PaymentStatus | "all")[] = ["all", "initiated", "validated", "failed", "cancelled"];

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<PaymentStatus | "all">("all");

  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ["admin-payments", tab],
    queryFn: () =>
      apiClient.get<AdminPayment[]>(
        `/api/v1/admin/payments${tab === "all" ? "" : `?status=${tab}`}`,
        { auth: true }
      ),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Payments</h1>

      <PendingBankTransfersSection />

      <h2 className="mt-8 text-lg font-semibold text-zinc-900 dark:text-zinc-50">All Payments</h2>

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
            {t === "all" ? "All" : PAYMENT_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {isError && (
        <div className="mt-6">
          <ErrorState message="Couldn't load payments. Please try again." />
        </div>
      )}
      {!isLoading && !isError && (payments ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No payments found" />
        </div>
      )}

      {!isLoading && !isError && (payments ?? []).length > 0 && (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
                <th className="py-3 pl-4 pr-4">Transaction</th>
                <th className="py-3 pr-4">Provider</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Amount</th>
                <th className="py-3 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => (
                <tr key={p.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                  <td className="py-2.5 pl-4 pr-4 font-mono text-xs">{p.tran_id}</td>
                  <td className="py-2.5 pr-4 capitalize">{p.provider}</td>
                  <td className="py-2.5 pr-4">{PAYMENT_STATUS_LABELS[p.status]}</td>
                  <td className="py-2.5 pr-4 font-medium text-primary-600 dark:text-primary-400">
                    {p.amount} {p.currency}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-zinc-500">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function PendingBankTransfersSection() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: pending, isLoading } = useQuery({
    queryKey: ["admin-pending-bank-transfers"],
    queryFn: () => apiClient.get<BankTransferPayment[]>("/api/v1/admin/payments/bank-transfers/pending", { auth: true }),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-pending-bank-transfers"] });
    queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (!isLoading && (pending ?? []).length === 0) return null;

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pending Bank Transfers</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {isLoading && <Spinner />}
      <div className="mt-3 flex flex-col gap-3">
        {(pending ?? []).map((p) => (
          <BankTransferRow key={p.id} payment={p} run={run} />
        ))}
      </div>
    </Card>
  );
}

function BankTransferRow({ payment, run }: { payment: BankTransferPayment; run: (fn: () => Promise<unknown>) => void }) {
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"verify" | "reject" | null>(null);

  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs text-zinc-500">{payment.tran_id}</p>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{formatMoney(payment.amount)}</p>
          <p className="text-xs text-zinc-500">Reference: {payment.bank_reference ?? "(not yet submitted)"}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            loading={busy === "verify"}
            disabled={!payment.bank_reference}
            onClick={async () => {
              setBusy("verify");
              await run(() => apiClient.post(`/api/v1/admin/payments/bank-transfers/${payment.id}/verify`, undefined, { auth: true }));
              setBusy(null);
            }}
          >
            Verify
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowReject((s) => !s)}>
            Reject
          </Button>
        </div>
      </div>
      {showReject && (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the traveler)" rows={2} />
          <Button
            size="sm"
            variant="destructive"
            className="self-start"
            loading={busy === "reject"}
            disabled={!reason}
            onClick={async () => {
              setBusy("reject");
              await run(() => apiClient.post(`/api/v1/admin/payments/bank-transfers/${payment.id}/reject`, { reason }, { auth: true }));
              setBusy(null);
            }}
          >
            Confirm rejection
          </Button>
        </div>
      )}
    </div>
  );
}
