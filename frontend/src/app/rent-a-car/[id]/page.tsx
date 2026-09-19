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
import { VEHICLE_TYPE_ICONS } from "@/lib/vehicleIcons";
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

  const TypeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicle_type];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <div className="flex aspect-[21/9] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600">
        <TypeIcon className="h-20 w-20 text-white/90" strokeWidth={1.25} />
      </div>

      <h1 className="mt-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{vehicle.make} {vehicle.model} ({vehicle.year})</h1>
      <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">
        {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} · {vehicle.transmission} · {vehicle.seats} seats · {formatMoney(vehicle.price_per_day)}/day <ApproxPrice amountBDT={vehicle.price_per_day} />
        {vehicle.with_driver && " · comes with a driver"}
      </p>

      <div className="mt-3">
        <MessageButton contextType="vehicle" contextId={vehicle.id} label="Message this Rent-a-Car partner" />
      </div>

      <div className="mt-8 flex flex-col gap-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          {vehicle.description && <p className="text-sm text-zinc-700 dark:text-zinc-300">{vehicle.description}</p>}

          <FrequentlyBookedWith endpoint={`/api/v1/vehicles/${vehicle.id}/frequently-booked-with`} />
          <SimilarVehicles vehicleId={vehicle.id} />
        </div>

        <div className="lg:w-80 lg:shrink-0">
          <div className="lg:sticky lg:top-20">
            <BookVehicleSection vehicle={vehicle} />
          </div>
        </div>
      </div>
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
      <Card variant="elevated">
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
    <Card variant="elevated">
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {formatMoney(vehicle.price_per_day)} <span className="text-sm font-normal text-zinc-500">/ day</span>
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <Input type="date" label="Pickup" value={pickup} onChange={(e) => setPickup(e.target.value)} />
        <Input type="date" label="Return" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        {days > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
            <span className="text-zinc-500">{days} day(s)</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={book} loading={submitting} disabled={days <= 0} className="w-full">
          {submitting ? "Redirecting to payment…" : "Book & Pay"}
        </Button>
        <Button variant="secondary" onClick={addVehicleToCart} disabled={days <= 0} className="w-full">
          Add to cart
        </Button>
        {addedToCart && (
          <Link href="/cart" className="text-center text-sm text-primary-600 underline dark:text-primary-400">
            Added to cart →
          </Link>
        )}
      </div>
    </Card>
  );
}
