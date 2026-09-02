"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";

type ReportRow = Record<string, string | number | boolean | null>;

const REPORTS = [
  { key: "bookings-summary", label: "Bookings Summary" },
  { key: "platform-revenue", label: "Platform Revenue" },
  { key: "partner-performance", label: "Partner Performance" },
  { key: "fraud-overview", label: "Fraud Overview" },
  { key: "dispute-overview", label: "Dispute Overview" },
  { key: "referral-overview", label: "Referral Overview" },
  { key: "partner-approval-funnel", label: "Partner Approval Funnel" },
] as const;

const MONEY_FIELDS = new Set(["gross_revenue", "platform_revenue", "partner_net_revenue"]);

export default function AdminReportsPage() {
  const [active, setActive] = useState<(typeof REPORTS)[number]["key"]>("bookings-summary");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-report", active],
    queryFn: () => apiClient.get<ReportRow[]>(`/api/v1/admin/reports/${active}`, { auth: true }),
  });

  const downloadCsv = async () => {
    const blob = await apiClient.getBlob(`/api/v1/admin/reports/${active}?csv=true`, { auth: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Reports</h1>
      <p className="mt-1 text-sm text-zinc-500">
        A curated set of reports built from existing platform data — not a 20-report suite, since a smaller set of genuinely
        useful, correctly-computed reports beats a large set of superficial ones.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active === r.key
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-zinc-500">{rows?.length ?? 0} row(s)</p>
        <button onClick={downloadCsv} className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Export CSV
        </button>
      </div>

      {isLoading && <Spinner />}

      {!isLoading && (
        <Card className="mt-3 overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
                {columns.map((col) => (
                  <th key={col} className="py-3 pl-4 pr-4 first:pl-4">{col.replace(/_/g, " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  {columns.map((col) => (
                    <td key={col} className="py-2.5 pl-4 pr-4">
                      {MONEY_FIELDS.has(col) && row[col] !== null ? formatMoney(String(row[col])) : String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {(rows ?? []).length === 0 && <p className="p-4 text-sm text-zinc-400">No data for this report yet.</p>}
        </Card>
      )}
    </div>
  );
}
