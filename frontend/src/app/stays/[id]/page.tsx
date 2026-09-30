"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BedDouble,
  Building2,
  CalendarClock,
  ChefHat,
  Clock,
  Coffee,
  Dog,
  Droplets,
  PawPrint,
  PlaneTakeoff,
  ScrollText,
  ShieldCheck,
  SquareParking,
  Snowflake,
  Tv,
  Users,
  Waves,
  Wifi,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import Link from "next/link";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { FrequentlyBookedWith } from "@/components/shared/FrequentlyBookedWith";
import { MessageButton } from "@/components/shared/MessageButton";
import { PhotoGallery } from "@/components/shared/PhotoGallery";
import { ReviewsList } from "@/components/shared/ReviewsList";
import { SimilarProperties } from "@/components/shared/SimilarProperties";
import { TrustBadges } from "@/components/shared/TrustBadges";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { propertyImageUrl } from "@/lib/media";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS, type AmenityKey, type Property } from "@/types/stay";

const AMENITY_ICONS: Record<AmenityKey, React.ReactNode> = {
  wifi: <Wifi className="h-4 w-4" />,
  pool: <Waves className="h-4 w-4" />,
  parking: <SquareParking className="h-4 w-4" />,
  ac: <Snowflake className="h-4 w-4" />,
  breakfast_included: <Coffee className="h-4 w-4" />,
  pet_friendly: <PawPrint className="h-4 w-4" />,
  airport_pickup: <PlaneTakeoff className="h-4 w-4" />,
  tv: <Tv className="h-4 w-4" />,
  hot_water: <Droplets className="h-4 w-4" />,
  kitchen: <ChefHat className="h-4 w-4" />,
};

export default function StayDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: property, isLoading, error } = useQuery({
    queryKey: ["public-property", id],
    queryFn: () => apiClient.get<Property>(`/api/v1/properties/${id}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (error || !property) return <ErrorState message="Property not found." />;

  const hasPolicies = property.check_in_time || property.check_out_time || property.cancellation_policy || property.house_rules;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary-50 to-transparent dark:from-primary-950/30" />

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-10 lg:pb-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-accent-500 px-2.5 py-1 text-xs font-medium text-white">
                  <Building2 className="h-3.5 w-3.5" /> {PROPERTY_TYPE_LABELS[property.property_type]}
                </span>
                <TrustBadges entityType="property" entityId={property.id} />
              </div>
              <h1 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl dark:text-zinc-50">{property.name}</h1>
            </div>
            <MessageButton contextType="property" contextId={property.id} label="Message this Host" />
          </div>

          {property.room_types.length > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              from {formatMoney(property.room_types[0].base_price)} <ApproxPrice amountBDT={property.room_types[0].base_price} />
              <span className="text-sm font-normal text-zinc-500"> / night</span>
            </p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="overflow-hidden rounded-3xl shadow-elevated"
        >
          <PhotoGallery images={property.images} urlFor={(img) => propertyImageUrl(property.id, img.id)} alt={property.name} />
        </motion.div>

        <div className="mt-8 flex flex-col gap-10 lg:flex-row">
          <div className="min-w-0 flex-1 space-y-6">
            {property.description && (
              <Section>
                <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{property.description}</p>
              </Section>
            )}

            {property.amenities.length > 0 && (
              <Section title="Amenities" icon={<Wifi className="h-4 w-4" />}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {property.amenities.map((a) => (
                    <div key={a.amenity} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="text-primary-600 dark:text-primary-400">{AMENITY_ICONS[a.amenity]}</span>
                      {AMENITY_LABELS[a.amenity]}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {property.room_types.length > 0 && (
              <Section title="Room types" icon={<BedDouble className="h-4 w-4" />}>
                <div className="flex flex-col gap-2.5">
                  {property.room_types.map((rt) => (
                    <div key={rt.id} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/40">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-zinc-900 dark:text-zinc-50">{rt.name}</p>
                        <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                          {formatMoney(rt.base_price)} <span className="text-xs font-normal text-zinc-500">/ night</span>
                        </p>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <Users className="h-3.5 w-3.5" /> Up to {rt.max_occupancy} guests
                        {rt.min_stay_nights ? ` · min ${rt.min_stay_nights} night(s)` : ""}
                      </p>
                      {rt.description && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{rt.description}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {hasPolicies && (
              <Section title="Policies" icon={<ShieldCheck className="h-4 w-4" />}>
                <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {property.check_in_time && (
                    <PolicyRow icon={<Clock className="h-4 w-4" />} label="Check-in">
                      {property.check_in_time}
                    </PolicyRow>
                  )}
                  {property.check_out_time && (
                    <PolicyRow icon={<CalendarClock className="h-4 w-4" />} label="Check-out">
                      {property.check_out_time}
                    </PolicyRow>
                  )}
                  {property.cancellation_policy && (
                    <PolicyRow icon={<ShieldCheck className="h-4 w-4" />} label="Cancellation">
                      {property.cancellation_policy}
                    </PolicyRow>
                  )}
                  {property.house_rules && (
                    <PolicyRow icon={<ScrollText className="h-4 w-4" />} label="House rules">
                      {property.house_rules}
                    </PolicyRow>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${property.children_allowed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                    <Users className="h-3.5 w-3.5" /> {property.children_allowed ? "Children welcome" : "Not suitable for children"}
                  </span>
                  <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${property.pets_allowed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                    <Dog className="h-3.5 w-3.5" /> {property.pets_allowed ? "Pets allowed" : "No pets"}
                  </span>
                </div>
              </Section>
            )}

            <Section title="Reviews">
              <ReviewsList propertyId={property.id} />
            </Section>

            <FrequentlyBookedWith endpoint={`/api/v1/properties/${property.id}/frequently-booked-with`} />
            <SimilarProperties propertyId={property.id} />
          </div>

          {property.room_types.length > 0 && (
            <div className="lg:w-80 lg:shrink-0">
              <div id="book-section" className="scroll-mt-24 lg:sticky lg:top-20">
                <BookStaySection property={property} />
              </div>
            </div>
          )}
        </div>

        {property.room_types.length > 0 && (
          <MobileBookBar priceLabel={formatMoney(property.room_types[0].base_price)} priceSuffix="/ night" />
        )}
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

function PolicyRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400">{icon}</span>
      <p className="text-zinc-600 dark:text-zinc-400">
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{label}: </span>
        {children}
      </p>
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

function BookStaySection({ property }: { property: Property }) {
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.addItem);
  const [roomTypeId, setRoomTypeId] = useState(property.room_types[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [guestNames, setGuestNames] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const roomType = property.room_types.find((r) => r.id === roomTypeId);
  const nights = checkIn && checkOut ? Math.max(0, (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000) : 0;
  const total = roomType ? (Number(roomType.base_price) * nights * quantity).toFixed(2) : "0.00";

  const addStayToCart = () => {
    if (!roomType || nights <= 0) return;
    addToCart({
      key: `stay-${roomTypeId}-${Date.now()}`,
      item_type: "room_type",
      title: `${property.name} — ${roomType.name}`,
      subtitle: `${checkIn} → ${checkOut} · ${quantity} room(s)`,
      unit_price: roomType.base_price,
      quantity,
      nights,
      room_type_id: roomTypeId,
      check_in_date: checkIn,
      check_out_date: checkOut,
    });
    setAddedToCart(true);
  };

  const book = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const booking = await apiClient.post<Booking>(
        "/api/v1/bookings",
        {
          items: [{ item_type: "room_type", room_type_id: roomTypeId, check_in_date: checkIn, check_out_date: checkOut, quantity }],
          guests: guestNames.filter((n) => n.trim()).map((full_name) => ({ full_name })),
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

  if (!user) {
    return (
      <Card variant="elevated">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/account/login" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in
          </Link>{" "}
          to book this stay.
        </p>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {formatMoney(roomType?.base_price ?? property.room_types[0].base_price)}{" "}
        <span className="text-sm font-normal text-zinc-500">/ night</span>
      </p>
      <p className="text-xs text-zinc-400">
        <ApproxPrice amountBDT={roomType?.base_price ?? property.room_types[0].base_price} />
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Select label="Room type" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
          {property.room_types.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name} — {formatMoney(rt.base_price)}/night</option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Input type="date" label="Check-in" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="flex-1" />
          <Input type="date" label="Check-out" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="flex-1" />
        </div>
        <Input type="number" label="Rooms" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        <div className="flex flex-col gap-2">
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
        {nights > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm dark:border-zinc-800">
            <span className="text-zinc-500">
              {nights} night(s) × {quantity} room(s)
            </span>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={book} loading={submitting} disabled={!roomTypeId || nights <= 0} className="w-full">
          {submitting ? "Redirecting to payment…" : "Book & Pay"}
        </Button>
        <Button variant="secondary" onClick={addStayToCart} disabled={!roomTypeId || nights <= 0} className="w-full">
          Add to cart
        </Button>
        {addedToCart && (
          <Link href="/cart" className="text-center text-sm text-primary-600 underline dark:text-primary-400">
            Added — combine with a tour in your cart →
          </Link>
        )}
      </div>
    </Card>
  );
}
