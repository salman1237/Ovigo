"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import { VEHICLE_TYPE_LABELS, type Vehicle } from "@/types/rentcar";

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ["public-vehicle", id],
    queryFn: () => apiClient.get<Vehicle>(`/api/v1/vehicles/${id}`),
    retry: false,
  });

  if (isLoading) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;
  if (error || !vehicle) return <p className="px-6 py-12 text-sm text-zinc-400">Vehicle not found.</p>;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{vehicle.make} {vehicle.model} ({vehicle.year})</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} · {vehicle.transmission} · {vehicle.seats} seats · {formatMoney(vehicle.price_per_day)}/day
        {vehicle.with_driver && " · comes with a driver"}
      </p>
      {vehicle.description && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{vehicle.description}</p>}

      <BookVehicleSection vehicle={vehicle} />
    </div>
  );
}

function BookVehicleSection({ vehicle }: { vehicle: Vehicle }) {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addItem);
  const [pickup, setPickup] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const days = pickup && returnDate ? Math.max(0, (new Date(returnDate).getTime() - new Date(pickup).getTime()) / 86400000) : 0;
  const total = (Number(vehicle.price_per_day) * days).toFixed(2);

  const book = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const booking = await apiClient.post<Booking>(
        "/api/v1/bookings",
        { items: [{ item_type: "vehicle_rental", vehicle_id: vehicle.id, check_in_date: pickup, check_out_date: returnDate, quantity: 1 }], guests: [] },
        { auth: true }
      );
      const payment = await apiClient.post<{ gateway_page_url: string }>(
        "/api/v1/payments/initiate",
        { booking_id: booking.id },
        { auth: true }
      );
      window.location.href = payment.gateway_page_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start booking");
      setSubmitting(false);
    }
  };

  const addVehicleToCart = () => {
    if (days <= 0) return;
    addToCart({
      key: `vehicle-${vehicle.id}-${Date.now()}`,
      item_type: "vehicle_rental",
      title: `${vehicle.make} ${vehicle.model}`,
      subtitle: `${pickup} → ${returnDate}`,
      unit_price: vehicle.price_per_day,
      quantity: 1,
      nights: days,
      vehicle_id: vehicle.id,
      check_in_date: pickup,
      check_out_date: returnDate,
    });
    setAddedToCart(true);
  };

  if (!user) {
    return (
      <div className="mt-10 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <a href="/account/login" className="font-medium underline">Sign in</a> to book this vehicle.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Book this vehicle</h2>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex gap-2">
          <div>
            <label className="block text-xs font-medium text-zinc-500">Pickup</label>
            <input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500">Return</label>
            <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="mt-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
          </div>
        </div>
        {days > 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {days} day(s) — Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={book}
            disabled={submitting || days <= 0}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {submitting ? "Redirecting to payment…" : "Book & Pay"}
          </button>
          <button
            onClick={addVehicleToCart}
            disabled={days <= 0}
            className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            Add to cart
          </button>
          {addedToCart && (
            <Link href="/cart" className="text-sm text-emerald-600 underline">
              Added to cart →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
