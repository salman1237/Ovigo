"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import { AdminBooking } from "@/types/admin-overview";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/types/booking";

const TABS: (BookingStatus | "all")[] = [
  "all",
  "pending_payment",
  "confirmed",
  "checked_in",
  "checked_out",
  "completed",
  "cancelled",
];

export default function AdminBookingsPage() {
  const [tab, setTab] = useState<BookingStatus | "all">("all");

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["admin-bookings", tab],
    queryFn: () =>
      apiClient.get<AdminBooking[]>(
        `/api/v1/admin/bookings${tab === "all" ? "" : `?status=${tab}`}`,
        { auth: true }
      ),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Bookings</h1>

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
            {t === "all" ? "All" : BOOKING_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (bookings ?? []).length === 0 && (
        <p className="mt-6 text-sm text-zinc-400">No bookings found.</p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
              <th className="py-2 pr-4">Traveler</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Items</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {(bookings ?? []).map((b) => (
              <tr key={b.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-2.5 pr-4">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">{b.traveler.full_name}</div>
                  <div className="text-xs text-zinc-500">{b.traveler.email ?? b.traveler.phone}</div>
                </td>
                <td className="py-2.5 pr-4 capitalize">{BOOKING_STATUS_LABELS[b.status]}</td>
                <td className="py-2.5 pr-4">{b.item_count}</td>
                <td className="py-2.5 pr-4">
                  {b.total_amount} {b.currency}
                </td>
                <td className="py-2.5 pr-4 text-xs text-zinc-500">{new Date(b.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
