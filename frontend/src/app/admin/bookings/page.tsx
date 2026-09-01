"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/cn";
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

  const { data: bookings, isLoading, isError } = useQuery({
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
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t === "all" ? "All" : BOOKING_STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {isError && (
        <div className="mt-6">
          <ErrorState message="Couldn't load bookings. Please try again." />
        </div>
      )}
      {!isLoading && !isError && (bookings ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No bookings found" />
        </div>
      )}

      {!isLoading && !isError && (bookings ?? []).length > 0 && (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-400 dark:border-zinc-800">
                <th className="py-3 pl-4 pr-4">Traveler</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Items</th>
                <th className="py-3 pr-4">Total</th>
                <th className="py-3 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {(bookings ?? []).map((b) => (
                <tr key={b.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                  <td className="py-2.5 pl-4 pr-4">
                    <div className="font-medium text-zinc-900 dark:text-zinc-50">{b.traveler.full_name}</div>
                    <div className="text-xs text-zinc-500">{b.traveler.email ?? b.traveler.phone}</div>
                  </td>
                  <td className="py-2.5 pr-4 capitalize">{BOOKING_STATUS_LABELS[b.status]}</td>
                  <td className="py-2.5 pr-4">{b.item_count}</td>
                  <td className="py-2.5 pr-4 font-medium text-primary-600 dark:text-primary-400">
                    {b.total_amount} {b.currency}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-zinc-500">{new Date(b.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
