"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { AdminPayment, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/types/admin-overview";

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
