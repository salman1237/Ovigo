"use client";

import { motion } from "framer-motion";
import { ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
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
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to check out.
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
        <div className="mt-8">
          <EmptyState
            icon={ShoppingCart}
            title="Your cart is empty"
            description="Add a tour or a stay from its detail page to get started."
          />
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-6 flex flex-col gap-3">
            {items.map((item, i) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: i * 0.05 }}
              >
                <Card className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                    <p className="text-xs text-zinc-500">{item.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-primary-600 dark:text-primary-400">{formatMoney(cartItemTotal(item).toFixed(2))}</span>
                    <button
                      onClick={() => removeItem(item.key)}
                      aria-label={`Remove ${item.title}`}
                      className="rounded-full p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Guest / traveler names</h2>
            <div className="mt-2 flex flex-col gap-2">
              {guestNames.map((name, i) => (
                <Input
                  key={i}
                  value={name}
                  onChange={(e) => setGuestNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                  placeholder={`Guest ${i + 1} full name`}
                />
              ))}
              <button
                type="button"
                onClick={() => setGuestNames((prev) => [...prev, ""])}
                className="self-start text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                + add another guest
              </button>
            </div>
          </div>

          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total.toFixed(2))}</span>
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button onClick={checkout} loading={submitting} className="mt-4">
            {submitting ? "Redirecting to payment…" : "Checkout & Pay"}
          </Button>
        </>
      )}
    </div>
  );
}
