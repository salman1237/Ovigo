"use client";

import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { cartItemTotal, useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";

export default function CartPage() {
  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, item) => sum + cartItemTotal(item), 0);

  const checkout = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const booking = await apiClient.post<Booking>(
        "/api/v1/bookings",
        {
          items: items.map((item) => ({
            item_type: item.item_type,
            tour_departure_id: item.tour_departure_id,
            room_type_id: item.room_type_id,
            vehicle_id: item.vehicle_id,
            check_in_date: item.check_in_date,
            check_out_date: item.check_out_date,
            quantity: item.quantity,
          })),
          guests: guestNames.filter((n) => n.trim()).map((full_name) => ({ full_name })),
        },
        { auth: true }
      );
      clear();
      const payment = await apiClient.post<{ gateway_page_url: string }>(
        "/api/v1/payments/initiate",
        { booking_id: booking.id },
        { auth: true }
      );
      window.location.href = payment.gateway_page_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout");
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Cart</h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <a href="/account/login" className="font-medium underline">Sign in</a> to check out.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Cart</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Combine a tour, a stay, and a vehicle rental into one checkout — one payment, one booking record.
      </p>

      {items.length === 0 && (
        <p className="mt-8 text-sm text-zinc-400">
          Your cart is empty. Add a tour or a stay from its detail page to get started.
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-6 flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.key} className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                  <p className="text-xs text-zinc-500">{item.subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{formatMoney(cartItemTotal(item).toFixed(2))}</span>
                  <button onClick={() => removeItem(item.key)} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Guest / traveler names</h2>
            <div className="mt-2 flex flex-col gap-2">
              {guestNames.map((name, i) => (
                <input
                  key={i}
                  value={name}
                  onChange={(e) => setGuestNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                  placeholder={`Guest ${i + 1} full name`}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              ))}
              <button
                type="button"
                onClick={() => setGuestNames((prev) => [...prev, ""])}
                className="self-start text-xs text-zinc-500 underline"
              >
                + add another guest
              </button>
            </div>
          </div>

          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total.toFixed(2))}</span>
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={checkout}
            disabled={submitting}
            className="mt-4 rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {submitting ? "Redirecting to payment…" : "Checkout & Pay"}
          </button>
        </>
      )}
    </div>
  );
}
