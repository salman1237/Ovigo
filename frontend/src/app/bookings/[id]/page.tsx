"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { MessageButton } from "@/components/shared/MessageButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { BOOKING_STATUS_LABELS, type Booking, type BookingItem } from "@/types/booking";
import type { Dispute } from "@/types/dispute";

export default function BookingDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
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

  if (isLoading || !booking) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      {paymentResult === "success" && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Payment successful! Your booking is confirmed.
        </p>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Booking</h1>
        <Badge variant="primary">{BOOKING_STATUS_LABELS[booking.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Total: {formatMoney(booking.total_amount)} <ApproxPrice amountBDT={booking.total_amount} /></p>
      {Number(booking.tax_service_amount) > 0 && (
        <p className="text-xs text-zinc-400">Includes {formatMoney(booking.tax_service_amount)} tax &amp; service charge</p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        {booking.status === "pending_payment" && (
          <Button
            onClick={async () => {
              const payment = await apiClient.post<{ gateway_page_url: string }>(
                "/api/v1/payments/initiate", { booking_id: booking.id }, { auth: true }
              );
              window.location.href = payment.gateway_page_url;
            }}
          >
            Pay now
          </Button>
        )}
        {booking.status === "pending_payment" && <BankTransferButton bookingId={booking.id} onSubmitted={refetch} />}
        {(booking.status === "pending_payment" || booking.status === "confirmed") && (
          <Button
            variant="destructive"
            onClick={() => run(() => apiClient.post(`/api/v1/bookings/${id}/cancel`, undefined, { auth: true }))}
          >
            Cancel booking
          </Button>
        )}
        {booking.status === "confirmed" && (
          <Button
            variant="secondary"
            onClick={() => run(() => apiClient.post(`/api/v1/bookings/${id}/check-in`, undefined, { auth: true }))}
          >
            Check in
          </Button>
        )}
        {booking.status === "checked_in" && (
          <Button
            variant="secondary"
            onClick={() => run(() => apiClient.post(`/api/v1/bookings/${id}/check-out`, undefined, { auth: true }))}
          >
            Check out
          </Button>
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

function BankTransferButton({ bookingId, onSubmitted }: { bookingId: string; onSubmitted: () => void }) {
  const [payment, setPayment] = useState<{ payment: { id: string }; instructions: string } | null>(null);
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initiate = async () => {
    setBusy(true);
    setError(null);
    try {
      setPayment(
        await apiClient.post<{ payment: { id: string }; instructions: string }>(
          "/api/v1/payments/bank-transfer/initiate", { booking_id: bookingId }, { auth: true }
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start bank transfer");
    } finally {
      setBusy(false);
    }
  };

  const submitReference = async () => {
    if (!payment) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/payments/bank-transfer/${payment.payment.id}/reference`, { bank_reference: reference }, { auth: true });
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to submit reference");
    } finally {
      setBusy(false);
    }
  };

  if (!payment) {
    return (
      <Button variant="secondary" onClick={initiate} loading={busy}>
        Pay by bank transfer
      </Button>
    );
  }

  return (
    <Card className="mt-3 w-full">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{payment.instructions}</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {submitted ? (
        <p className="mt-2 text-sm text-emerald-600">Reference submitted — we&apos;ll confirm your booking once we verify the transfer.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Your transfer reference number" className="flex-1" />
          <Button size="sm" onClick={submitReference} loading={busy} disabled={!reference}>
            Submit reference
          </Button>
        </div>
      )}
    </Card>
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
        <Card className="mt-2 p-3 text-sm">
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            {dispute.status === "open" ? "Dispute under review" : "Dispute resolved"}
          </p>
          <p className="mt-1 text-zinc-500">{dispute.reason}</p>
          {dispute.status === "resolved" && (
            <p className="mt-2 text-xs text-zinc-500">
              Outcome: <span className="capitalize font-medium">{dispute.resolution}</span> — {dispute.resolution_note}
            </p>
          )}
        </Card>
      ) : (
        <>
          {!showForm && (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)} className="mt-2">
              Report a problem
            </Button>
          )}
          {showForm && (
            <div className="mt-2 flex flex-col gap-2">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe what went wrong with this booking…"
                rows={3}
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={submit} loading={busy}>
                  Submit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
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
    <Card className="p-3 text-sm">
      <p className="font-medium capitalize">{item.item_type.replace("_", " ")}</p>
      <p className="text-zinc-500">
        {item.quantity} × {formatMoney(item.unit_price)} = {formatMoney(item.subtotal)}
        {item.check_in_date && ` · ${item.check_in_date} → ${item.check_out_date}`}
      </p>
      <p className="mt-1 text-xs capitalize text-zinc-400">{item.status.replace("_", " ")}</p>

      {item.status !== "cancelled" && (
        <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <MessageButton contextType="booking_item" contextId={item.id} label="Message about this" size="sm" />
        </div>
      )}

      {item.status === "completed" && !submitted && (
        <div className="mt-2 flex flex-col gap-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className={n <= rating ? "text-amber-500" : "text-zinc-300 dark:text-zinc-700"}>
                ★
              </button>
            ))}
          </div>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Leave a comment (optional)" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button size="sm" variant="secondary" onClick={submitReview} className="self-start">
            Submit review
          </Button>
        </div>
      )}
      {submitted && <p className="mt-2 text-xs text-emerald-600">Thanks for your review!</p>}
    </Card>
  );
}
