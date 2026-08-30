"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useParams } from "next/navigation";
import { Suspense, useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { BOOKING_STATUS_LABELS, type Booking, type BookingItem } from "@/types/booking";
import type { Dispute } from "@/types/dispute";

export default function BookingDetailPage() {
  return (
    <Suspense fallback={<p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>}>
      <BookingDetailContent />
    </Suspense>
  );
}

function BookingDetailContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const paymentResult = searchParams.get("payment");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: booking, isLoading } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => apiClient.get<Booking>(`/api/v1/bookings/${id}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["booking", id] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !booking) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      {paymentResult === "success" && (
        <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Payment successful! Your booking is confirmed.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Booking</h1>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {BOOKING_STATUS_LABELS[booking.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Total: {formatMoney(booking.total_amount)}</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {booking.status === "pending_payment" && (
          <button
            onClick={async () => {
              const payment = await apiClient.post<{ gateway_page_url: string }>(
                "/api/v1/payments/initiate", { booking_id: booking.id }, { auth: true }
              );
              window.location.href = payment.gateway_page_url;
            }}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Pay now
          </button>
        )}
        {(booking.status === "pending_payment" || booking.status === "confirmed") && (
          <button
            onClick={() => run(() => apiClient.post(`/api/v1/bookings/${id}/cancel`, undefined, { auth: true }))}
            className="rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
          >
            Cancel booking
          </button>
        )}
        {booking.status === "confirmed" && (
          <button
            onClick={() => run(() => apiClient.post(`/api/v1/bookings/${id}/check-in`, undefined, { auth: true }))}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Check in
          </button>
        )}
        {booking.status === "checked_in" && (
          <button
            onClick={() => run(() => apiClient.post(`/api/v1/bookings/${id}/check-out`, undefined, { auth: true }))}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Check out
          </button>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Items</h2>
        <div className="mt-2 flex flex-col gap-3">
          {booking.items.map((item) => (
            <BookingItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>

      {booking.guests.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Guests</h2>
          <ul className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {booking.guests.map((g) => <li key={g.id}>{g.full_name}{g.age ? ` (${g.age})` : ""}</li>)}
          </ul>
        </div>
      )}

      {booking.status !== "pending_payment" && <DisputeSection bookingId={booking.id} />}
    </div>
  );
}

function DisputeSection({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: disputes } = useQuery({
    queryKey: ["disputes", "mine"],
    queryFn: () => apiClient.get<Dispute[]>("/api/v1/disputes", { auth: true }),
  });

  const dispute = disputes?.find((d) => d.booking_id === bookingId);

  const submit = async () => {
    if (reason.trim().length < 10) {
      setError("Please describe the problem in at least 10 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.post("/api/v1/disputes", { booking_id: bookingId, reason }, { auth: true });
      setShowForm(false);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit dispute");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Problem with this booking?</h2>

      {dispute ? (
        <div className="mt-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {dispute.status === "open" ? "Dispute under review" : "Dispute resolved"}
          </p>
          <p className="mt-1 text-zinc-500">{dispute.reason}</p>
          {dispute.status === "resolved" && (
            <p className="mt-2 text-xs text-zinc-500">
              Outcome: <span className="capitalize font-medium">{dispute.resolution}</span> — {dispute.resolution_note}
            </p>
          )}
        </div>
      ) : (
        <>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium dark:border-zinc-700"
            >
              Report a problem
            </button>
          )}
          {showForm && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what went wrong with this booking…"
                rows={3}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={busy}
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  Submit
                </button>
                <button onClick={() => setShowForm(false)} className="text-xs text-zinc-500">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BookingItemCard({ item }: { item: BookingItem }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitReview = async () => {
    setError(null);
    try {
      await apiClient.post("/api/v1/reviews", { booking_item_id: item.id, rating, comment: comment || undefined }, { auth: true });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit review");
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <p className="font-medium capitalize">{item.item_type.replace("_", " ")}</p>
      <p className="text-zinc-500">
        {item.quantity} × {formatMoney(item.unit_price)} = {formatMoney(item.subtotal)}
        {item.check_in_date && ` · ${item.check_in_date} → ${item.check_out_date}`}
      </p>
      <p className="mt-1 text-xs capitalize text-zinc-400">{item.status.replace("_", " ")}</p>

      {item.status === "completed" && !submitted && (
        <div className="mt-2 flex flex-col gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className={n <= rating ? "text-amber-500" : "text-zinc-300 dark:text-zinc-700"}>
                ★
              </button>
            ))}
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Leave a comment (optional)"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={submitReview} className="self-start rounded-full border border-zinc-300 px-4 py-1 text-xs dark:border-zinc-700">
            Submit review
          </button>
        </div>
      )}
      {submitted && <p className="mt-2 text-xs text-emerald-600">Thanks for your review!</p>}
    </div>
  );
}
