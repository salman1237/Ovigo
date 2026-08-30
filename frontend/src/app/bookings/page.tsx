"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { BOOKING_STATUS_LABELS, type Booking } from "@/types/booking";

const STATUS_STYLES: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  checked_in: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  checked_out: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const PAYMENT_BANNER: Record<string, { text: string; style: string }> = {
  failed: { text: "Payment failed — your booking was released. You can try again.", style: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelled: { text: "Payment was cancelled — your booking was released.", style: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" },
  unknown: { text: "We couldn't confirm the payment result — check your booking status below.", style: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
};

export default function BookingsListPage() {
  return (
    <Suspense fallback={<p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>}>
      <BookingsListContent />
    </Suspense>
  );
}

function BookingsListContent() {
  const user = useAuthStore((s) => s.user);
  const searchParams = useSearchParams();
  const paymentResult = searchParams.get("payment");

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: () => apiClient.get<Booking[]>("/api/v1/bookings", { auth: true }),
    enabled: !!user,
  });

  if (!user) {
    return <p className="px-6 py-12 text-sm text-zinc-400">Sign in to see your bookings.</p>;
  }

  const banner = paymentResult ? PAYMENT_BANNER[paymentResult] : null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your Bookings</h1>

      {banner && <p className={`mt-4 rounded-md p-3 text-sm ${banner.style}`}>{banner.text}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (bookings ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No bookings yet.</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(bookings ?? []).map((booking) => (
          <Link
            key={booking.id}
            href={`/bookings/${booking.id}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">
                {booking.items.length} item{booking.items.length === 1 ? "" : "s"} · {formatMoney(booking.total_amount)}
              </p>
              <p className="text-xs text-zinc-500">{new Date(booking.created_at).toLocaleDateString()}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[booking.status]}`}>
              {BOOKING_STATUS_LABELS[booking.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
