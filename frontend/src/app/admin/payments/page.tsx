"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import { AdminPayment, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/admin-overview";

const TABS: (PaymentStatus | "all")[] = ["all", "initiated", "validated", "failed", "cancelled"];

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<PaymentStatus | "all">("all");

  const { data: payments, isLoading } = useQuery({
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

      <div className="mt-4 flex flex-wrap gap-2">
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
            {t === "all" ? "All" : PAYMENT_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (payments ?? []).length === 0 && (
        <p className="mt-6 text-sm text-zinc-400">No payments found.</p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
              <th className="py-2 pr-4">Transaction</th>
              <th className="py-2 pr-4">Provider</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2.5 pr-4 font-mono text-xs">{p.tran_id}</td>
                <td className="py-2.5 pr-4 capitalize">{p.provider}</td>
                <td className="py-2.5 pr-4">{PAYMENT_STATUS_LABELS[p.status]}</td>
                <td className="py-2.5 pr-4">
                  {p.amount} {p.currency}
                </td>
                <td className="py-2.5 pr-4 text-xs text-zinc-500">{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
