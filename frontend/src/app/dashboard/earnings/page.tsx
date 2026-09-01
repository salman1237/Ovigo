"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { EarningsSummary, Payout } from "@/types/earnings";

export default function EarningsPage() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <p className="px-6 py-12 text-sm text-zinc-400">Sign in to view your earnings.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Earnings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Commission is calculated automatically when a booking is paid, and becomes payable once the
        booking is completed. An admin periodically runs a payout batch that pays out everything
        currently payable.
      </p>

      <div className="mt-6 flex flex-col gap-6">
        <EarningsCard title="As a Local Expert" endpoint="/api/v1/partners/earnings/expert" />
        <EarningsCard title="As a Host" endpoint="/api/v1/partners/earnings/host" />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Payout History</h2>
        <PayoutHistory />
      </div>
    </div>
  );
}

function EarningsCard({ title, endpoint }: { title: string; endpoint: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["earnings", endpoint],
    queryFn: () => apiClient.get<EarningsSummary>(endpoint, { auth: true }),
    retry: false,
  });

  const notEligible = isError && error instanceof ApiError && error.status === 403;

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium text-zinc-900 dark:text-zinc-50">{title}</h2>
      {isLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
      {notEligible && <p className="mt-2 text-sm text-zinc-500">No approved role of this type yet.</p>}
      {data && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Stat label="Gross" value={data.total_gross} />
            <Stat label="Ovigo commission" value={data.total_commission} />
            <Stat label="Pending" value={data.total_net_pending} />
            <Stat label="Payable" value={data.total_net_payable} highlight />
            <Stat label="Paid out" value={data.total_net_paid} />
          </div>
          <div className="mt-4 flex flex-col gap-1">
            {data.commissions.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {new Date(c.created_at).toLocaleDateString()} · {(Number(c.rate) * 100).toFixed(0)}% of {formatMoney(c.gross_amount)}
                  {c.source === "network" && <span className="ml-1 text-purple-500">(network)</span>}
                </span>
                <span className={c.status === "payable" ? "text-emerald-600" : c.status === "paid" ? "text-zinc-400" : "text-amber-600"}>
                  {formatMoney(c.partner_net_amount)} · {c.status}
                </span>
              </div>
            ))}
            {data.commissions.length === 0 && <p className="text-xs text-zinc-400">No earnings yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function PayoutHistory() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["payouts", "mine"],
    queryFn: () => apiClient.get<Payout[]>("/api/v1/payouts/mine", { auth: true }),
    retry: false,
  });

  const notEligible = isError && error instanceof ApiError && error.status === 403;

  if (isLoading) return <p className="mt-2 text-sm text-zinc-400">Loading…</p>;
  if (notEligible) return <p className="mt-2 text-sm text-zinc-500">No approved partner role yet.</p>;
  if (!data || data.length === 0) return <p className="mt-2 text-sm text-zinc-400">No payouts yet.</p>;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {data.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
          <span>{new Date(p.paid_at).toLocaleDateString()} · {p.commission_count} commission(s)</span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatMoney(p.total_amount)}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-emerald-600" : "text-zinc-900 dark:text-zinc-50"}`}>{formatMoney(value)}</p>
    </div>
  );
}
