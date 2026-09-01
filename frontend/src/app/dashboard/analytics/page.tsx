"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { AnalyticsDashboard } from "@/types/analytics";

const TABS = [
  { key: "expert", label: "Local Expert", endpoint: "/api/v1/partners/analytics/expert" },
  { key: "host", label: "Host", endpoint: "/api/v1/partners/analytics/host" },
  { key: "vehicles", label: "Rent-a-Car", endpoint: "/api/v1/partners/analytics/vehicles" },
] as const;

export default function AnalyticsPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("expert");

  if (!user) {
    return <p className="px-6 py-12 text-sm text-zinc-400">Sign in to view your analytics.</p>;
  }

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analytics</h1>
      <p className="mt-1 text-sm text-zinc-500">Booking and revenue trends for your approved partner roles.</p>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AnalyticsDashboardView key={active.key} endpoint={active.endpoint} />
    </div>
  );
}

function AnalyticsDashboardView({ endpoint }: { endpoint: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["analytics", endpoint],
    queryFn: () => apiClient.get<AnalyticsDashboard>(endpoint, { auth: true }),
    retry: false,
  });

  const notEligible = isError && error instanceof ApiError && error.status === 403;

  if (isLoading) return <p className="mt-6 text-sm text-zinc-400">Loading…</p>;
  if (notEligible) return <p className="mt-6 text-sm text-zinc-500">No approved role of this type yet.</p>;
  if (!data) return null;

  const { summary, timeseries, top_listings } = data;

  return (
    <div className="mt-6 flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Bookings" value={String(summary.total_bookings)} />
        <Stat label="Completed" value={String(summary.completed_bookings)} />
        <Stat label="Gross revenue" value={formatMoney(summary.gross_revenue)} />
        <Stat label="Net earnings" value={formatMoney(summary.net_earnings)} highlight />
        <Stat label="Cancelled" value={String(summary.cancelled_bookings)} />
        <Stat
          label="Avg. rating"
          value={summary.average_rating !== null ? `${summary.average_rating.toFixed(1)} ★ (${summary.review_count})` : "No reviews yet"}
        />
      </div>

      {timeseries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Revenue over time</h2>
          <div className="mt-3 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatMoney(String(value ?? 0))} />
                <Line type="monotone" dataKey="gross_revenue" name="Gross revenue" stroke="#18181b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net_earnings" name="Net earnings" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {timeseries.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Bookings per month</h2>
          <div className="mt-3 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="bookings_count" name="Bookings" fill="#18181b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {timeseries.length === 0 && <p className="text-sm text-zinc-400">No bookings yet — trends will appear here once you have some.</p>}

      <div>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Top listings</h2>
        {top_listings.length === 0 && <p className="mt-2 text-sm text-zinc-400">No revenue-generating listings yet.</p>}
        <div className="mt-2 flex flex-col gap-2">
          {top_listings.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <span>{l.title}</span>
              <span className="text-zinc-500">{l.bookings_count} booking(s) · {formatMoney(l.gross_revenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-emerald-600" : "text-zinc-900 dark:text-zinc-50"}`}>{value}</p>
    </div>
  );
}
