"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { BOOKING_STATUS_LABELS, type Booking } from "@/types/booking";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  pending_payment: "warning",
  confirmed: "success",
  checked_in: "primary",
  checked_out: "primary",
  completed: "success",
  cancelled: "neutral",
};

const PAYMENT_BANNER: Record<string, { text: string; style: string }> = {
  failed: { text: "Payment failed — your booking was released. You can try again.", style: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelled: { text: "Payment was cancelled — your booking was released.", style: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" },
  unknown: { text: "We couldn't confirm the payment result — check your booking status below.", style: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
};

export default function BookingsListPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BookingsListContent />
    </Suspense>
  );
}

function BookingsListContent() {
  const user = useAuthStore((s) => s.user);
  const searchParams = useSearchParams();
  const paymentResult = searchParams.get("payment");

  const { data: bookings, isLoading, isError } = useQuery({
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

      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load your bookings. Please try again." />}
      {!isLoading && !isError && (bookings ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState icon={CalendarCheck} title="No bookings yet" description="Book a tour, stay or vehicle to see it here." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(bookings ?? []).map((booking) => (
          <Link key={booking.id} href={`/bookings/${booking.id}`}>
            <Card hoverable className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {booking.items.length} item{booking.items.length === 1 ? "" : "s"} · {formatMoney(booking.total_amount)}
                </p>
                <p className="text-xs text-zinc-500">{new Date(booking.created_at).toLocaleDateString()}</p>
              </div>
              <Badge variant={STATUS_VARIANTS[booking.status]}>{BOOKING_STATUS_LABELS[booking.status]}</Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
