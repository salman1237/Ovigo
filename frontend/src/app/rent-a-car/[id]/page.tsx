"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gauge, ShieldCheck, Snowflake, Users } from "lucide-react";
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
import { getAdClickCampaignId } from "@/lib/ad-attribution";
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

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (error || !vehicle) return <ErrorState message="Vehicle not found." />;

  const TypeIcon = VEHICLE_TYPE_ICONS[vehicle.vehicle_type];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary-50 to-transparent dark:from-primary-950/30" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-10 lg:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex aspect-[21/9] w-full items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-indigo-600 shadow-elevated"
        >
          <TypeIcon className="h-20 w-20 text-white/90" strokeWidth={1.25} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
          <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="rounded-full bg-accent-500 px-2.5 py-1 text-xs font-medium text-white">
                {VEHICLE_TYPE_LABELS[vehicle.vehicle_type]}
              </span>
              <h1 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-zinc-50">
                {vehicle.make} {vehicle.model} <span className="text-zinc-400 font-normal">({vehicle.year})</span>
              </h1>
            </div>
            <MessageButton contextType="vehicle" contextId={vehicle.id} label="Message this Rent-a-Car partner" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              {vehicle.transmission === "automatic" ? "Automatic" : "Manual"}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              {vehicle.seats} seats
            </span>
            {vehicle.with_driver && (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                Comes with a driver
              </span>
            )}
            <span className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-50">
              {formatMoney(vehicle.price_per_day)} <ApproxPrice amountBDT={vehicle.price_per_day} /> <span className="font-normal text-zinc-500">/ day</span>
            </span>
          </div>
        </motion.div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-6">
            {vehicle.description && (
              <Section>
                <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{vehicle.description}</p>
              </Section>
            )}

            <Section title="Specifications" icon={<Gauge className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Spec icon={<Users className="h-4 w-4" />} label="Seats" value={String(vehicle.seats)} />
                <Spec icon={<Gauge className="h-4 w-4" />} label="Transmission" value={vehicle.transmission === "automatic" ? "Automatic" : "Manual"} />
                <Spec icon={<Snowflake className="h-4 w-4" />} label="Type" value={VEHICLE_TYPE_LABELS[vehicle.vehicle_type]} />
                <Spec icon={<ShieldCheck className="h-4 w-4" />} label="Driver" value={vehicle.with_driver ? "Included" : "Self-drive"} />
              </div>
            </Section>

            <FrequentlyBookedWith endpoint={`/api/v1/vehicles/${vehicle.id}/frequently-booked-with`} />
            <SimilarVehicles vehicleId={vehicle.id} />
          </div>

          <div className="lg:w-80 lg:shrink-0">
            <div id="book-section" className="scroll-mt-24 lg:sticky lg:top-20">
              <BookVehicleSection vehicle={vehicle} />
            </div>
          </div>
        </div>

        <MobileBookBar priceLabel={formatMoney(vehicle.price_per_day)} priceSuffix="/ day" />
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card variant="elevated">
        {title && (
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {icon && <span className="text-primary-600 dark:text-primary-400">{icon}</span>}
            {title}
          </h2>
        )}
        <div className={title ? "mt-4" : undefined}>{children}</div>
      </Card>
    </motion.div>
  );
}

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 text-center dark:bg-zinc-900/40">
      <div className="flex justify-center text-primary-600 dark:text-primary-400">{icon}</div>
      <p className="mt-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

/** Mobile-only fixed CTA bar — on small screens the booking card sits at the
 * bottom of a long page, so this keeps price + a way to book always reachable
 * without requiring a full scroll. Scrolls to the real booking section (which
 * still does the actual booking) rather than duplicating its logic. */
function MobileBookBar({ priceLabel, priceSuffix }: { priceLabel: string; priceSuffix: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {priceLabel} <span className="text-xs font-normal text-zinc-500">{priceSuffix}</span>
      </p>
      <Button
        size="md"
        onClick={() => document.getElementById("book-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        Book now
      </Button>
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
        {
          items: [{ item_type: "vehicle_rental", vehicle_id: vehicle.id, check_in_date: pickup, check_out_date: returnDate, quantity: 1 }],
          guests: [],
          ad_campaign_id: getAdClickCampaignId(),
        },
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
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {formatMoney(vehicle.price_per_day)} <span className="text-sm font-normal text-zinc-500">/ day</span>
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Input type="date" label="Pickup" value={pickup} onChange={(e) => setPickup(e.target.value)} />
        <Input type="date" label="Return" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        {days > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
            <span className="text-zinc-500">{days} day(s)</span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
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
