"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { FrequentlyBookedWith } from "@/components/shared/FrequentlyBookedWith";
import { MessageButton } from "@/components/shared/MessageButton";
import { SimilarVehicles } from "@/components/shared/SimilarVehicles";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
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

  if (isLoading) return <Spinner />;
  if (error || !vehicle) return <ErrorState message="Vehicle not found." />;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{vehicle.make} {vehicle.model} ({vehicle.year})</h1>
      <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
        {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} · {vehicle.transmission} · {vehicle.seats} seats · {formatMoney(vehicle.price_per_day)}/day <ApproxPrice amountBDT={vehicle.price_per_day} />
        {vehicle.with_driver && " · comes with a driver"}
      </p>
      {vehicle.description && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{vehicle.description}</p>}

      <div className="mt-3">
        <MessageButton contextType="vehicle" contextId={vehicle.id} label="Message this Rent-a-Car partner" />
      </div>

      <BookVehicleSection vehicle={vehicle} />

      <FrequentlyBookedWith endpoint={`/api/v1/vehicles/${vehicle.id}/frequently-booked-with`} />
      <SimilarVehicles vehicleId={vehicle.id} />
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
      <Card className="mt-10">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to book this vehicle.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Book this vehicle</h2>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Input type="date" label="Pickup" value={pickup} onChange={(e) => setPickup(e.target.value)} />
          <Input type="date" label="Return" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </div>
        {days > 0 && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {days} day(s) — Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span> <ApproxPrice amountBDT={total} />
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={book} loading={submitting} disabled={days <= 0}>
            {submitting ? "Redirecting to payment…" : "Book & Pay"}
          </Button>
          <Button variant="secondary" onClick={addVehicleToCart} disabled={days <= 0}>
            Add to cart
          </Button>
          {addedToCart && (
            <Link href="/cart" className="text-sm text-primary-600 underline dark:text-primary-400">
              Added to cart →
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
