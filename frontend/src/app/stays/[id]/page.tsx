"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import Link from "next/link";

import { MessageButton } from "@/components/shared/MessageButton";
import { ReviewsList } from "@/components/shared/ReviewsList";
import { TrustBadges } from "@/components/shared/TrustBadges";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import type { Booking } from "@/types/booking";
import { AMENITY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/types/stay";

export default function StayDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: property, isLoading, error } = useQuery({
    queryKey: ["public-property", id],
    queryFn: () => apiClient.get<Property>(`/api/v1/properties/${id}`),
    retry: false,
  });

  if (isLoading) return <Spinner />;
  if (error || !property) return <ErrorState message="Property not found." />;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{property.name}</h1>
      <p className="mt-1 text-sm font-medium text-primary-600 dark:text-primary-400">{PROPERTY_TYPE_LABELS[property.property_type]}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TrustBadges entityType="property" entityId={property.id} />
        <MessageButton contextType="property" contextId={property.id} label="Message this Host" />
      </div>
      {property.description && <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{property.description}</p>}

      {property.amenities.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Amenities</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {property.amenities.map((a) => (
              <Badge key={a.amenity}>{AMENITY_LABELS[a.amenity]}</Badge>
            ))}
          </div>
        </div>
      )}

      {property.room_types.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Room types</h2>
          <div className="mt-2 flex flex-col gap-2">
            {property.room_types.map((rt) => (
              <Card key={rt.id} className="p-3 text-sm">
                <p className="font-medium">{rt.name}</p>
                <p className="text-zinc-500">Up to {rt.max_occupancy} guests · {formatMoney(rt.base_price)}/night</p>
                {rt.description && <p className="mt-1 text-zinc-400">{rt.description}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {(property.check_in_time || property.check_out_time || property.cancellation_policy || property.house_rules) && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Policies</h2>
          <dl className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {property.check_in_time && <div><dt className="inline font-medium">Check-in: </dt><dd className="inline">{property.check_in_time}</dd></div>}
            {property.check_out_time && <div><dt className="inline font-medium">Check-out: </dt><dd className="inline">{property.check_out_time}</dd></div>}
            {property.cancellation_policy && <div><dt className="inline font-medium">Cancellation: </dt><dd className="inline">{property.cancellation_policy}</dd></div>}
            {property.house_rules && <div><dt className="inline font-medium">House rules: </dt><dd className="inline">{property.house_rules}</dd></div>}
          </dl>
        </div>
      )}

      {property.room_types.length > 0 && <BookStaySection property={property} />}

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Reviews</h2>
        <div className="mt-2">
          <ReviewsList propertyId={property.id} />
        </div>
      </div>
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
      <Card className="mt-10">
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
    <Card className="mt-10">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Book this stay</h2>
      <div className="mt-3 flex flex-col gap-3">
        <Select label="Room type" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
          {property.room_types.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name} — {formatMoney(rt.base_price)}/night</option>
          ))}
        </Select>
        <div className="flex flex-wrap gap-2">
          <Input type="date" label="Check-in" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          <Input type="date" label="Check-out" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          <Input type="number" label="Rooms" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-24" />
        </div>
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {nights} night(s) × {quantity} room(s) — Total: <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatMoney(total)}</span>
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={book} loading={submitting} disabled={!roomTypeId || nights <= 0}>
            {submitting ? "Redirecting to payment…" : "Book & Pay"}
          </Button>
          <Button variant="secondary" onClick={addStayToCart} disabled={!roomTypeId || nights <= 0}>
            Add to cart
          </Button>
          {addedToCart && (
            <Link href="/cart" className="text-sm text-primary-600 underline dark:text-primary-400">
              Added — combine with a tour in your cart →
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
