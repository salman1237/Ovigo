"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { Booking, BOOKING_STATUS_LABELS } from "@/types/booking";
import { Property, Room } from "@/types/stay";

export default function FrontDeskPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: property } = useQuery({
    queryKey: ["property", id],
    queryFn: () => apiClient.get<Property>(`/api/v1/properties/${id}`, { auth: true }),
  });

  const { data: bookings, isLoading, isError } = useQuery({
    queryKey: ["front-desk-bookings", id],
    queryFn: () => apiClient.get<Booking[]>(`/api/v1/properties/${id}/front-desk/bookings`, { auth: true }),
    retry: false,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["front-desk-bookings", id] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  const forbidden = isError;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Front Desk</h1>
      <p className="mt-1 text-sm text-zinc-500">Walk-in bookings for {property?.name ?? "this property"} — paid in person, no online checkout.</p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {forbidden ? (
        <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          You don&apos;t have front-desk access to this property. Ask the host to invite you as staff.
        </p>
      ) : (
        <>
          {property && <NewBookingForm propertyId={id} property={property} run={run} />}

          <div className="mt-8 flex flex-col gap-3">
            {isLoading && <Spinner />}
            {!isLoading && (bookings ?? []).length === 0 && (
              <EmptyState title="No bookings yet" description="Walk-in bookings for this property will show up here." />
            )}
            {(bookings ?? []).map((b) => (
              <BookingRow key={b.id} propertyId={id} booking={b} run={run} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NewBookingForm({ propertyId, property, run }: { propertyId: string; property: Property; run: (fn: () => Promise<unknown>) => void }) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomTypeId, setRoomTypeId] = useState(property.room_types[0]?.id ?? "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  if (property.room_types.length === 0) {
    return <p className="mt-4 text-sm text-zinc-400">This property has no room types yet.</p>;
  }

  const submit = async () => {
    setBusy(true);
    await run(() =>
      apiClient.post(
        `/api/v1/properties/${propertyId}/front-desk/bookings`,
        {
          guest_name: guestName,
          guest_email: guestEmail,
          items: [
            {
              item_type: "room_type",
              room_type_id: roomTypeId,
              check_in_date: checkIn,
              check_out_date: checkOut,
              quantity,
            },
          ],
        },
        { auth: true }
      )
    );
    setBusy(false);
    setGuestName("");
    setGuestEmail("");
    setCheckIn("");
    setCheckOut("");
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">New walk-in booking</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Guest name" className="flex-1" />
        <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="Guest email" className="flex-1" />
        <Select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-auto">
          {property.room_types.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name} — {formatMoney(rt.base_price)}/night</option>
          ))}
        </Select>
        <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} title="Check-in" />
        <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} title="Check-out" />
        <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Rooms" className="w-24" />
      </div>
      <Button
        size="sm"
        className="mt-3"
        loading={busy}
        onClick={submit}
        disabled={!guestName || !guestEmail || !checkIn || !checkOut}
      >
        Create booking
      </Button>
      <p className="mt-2 text-xs text-zinc-400">
        If the guest doesn&apos;t have an Ovigo account yet, one is created automatically with this email.
      </p>
    </Card>
  );
}

function BookingRow({ propertyId, booking, run }: { propertyId: string; booking: Booking; run: (fn: () => Promise<unknown>) => void }) {
  const roomItem = booking.items.find((i) => i.item_type === "room_type");

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{formatMoney(booking.total_amount)}</span>
        <Badge variant="primary">{BOOKING_STATUS_LABELS[booking.status]}</Badge>
      </div>
      {roomItem && (
        <p className="mt-1 text-xs text-zinc-500">
          {roomItem.check_in_date} → {roomItem.check_out_date} · {roomItem.quantity} room(s)
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {roomItem && <RoomAssignSelect propertyId={propertyId} roomTypeId={roomItem.room_type_id!} bookingItemId={roomItem.id} assignedRoomId={roomItem.assigned_room_id} run={run} />}
        {booking.status === "confirmed" && (
          <Button size="sm" variant="secondary" onClick={() => run(() => apiClient.post(`/api/v1/properties/${propertyId}/front-desk/bookings/${booking.id}/check-in`, undefined, { auth: true }))}>
            Check in
          </Button>
        )}
        {booking.status === "checked_in" && (
          <Button size="sm" variant="secondary" onClick={() => run(() => apiClient.post(`/api/v1/properties/${propertyId}/front-desk/bookings/${booking.id}/check-out`, undefined, { auth: true }))}>
            Check out
          </Button>
        )}
      </div>
    </Card>
  );
}

function RoomAssignSelect({
  propertyId,
  roomTypeId,
  bookingItemId,
  assignedRoomId,
  run,
}: {
  propertyId: string;
  roomTypeId: string;
  bookingItemId: string;
  assignedRoomId: string | null;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const { data: rooms } = useQuery({
    queryKey: ["rooms", roomTypeId],
    queryFn: () => apiClient.get<Room[]>(`/api/v1/properties/${propertyId}/room-types/${roomTypeId}/rooms`, { auth: true }),
  });

  if (!rooms || rooms.length === 0) return null;

  return (
    <Select
      value={assignedRoomId ?? ""}
      onChange={(e) =>
        run(() =>
          apiClient.post(
            `/api/v1/properties/${propertyId}/front-desk/booking-items/${bookingItemId}/assign-room`,
            { room_id: e.target.value },
            { auth: true }
          )
        )
      }
      className="w-auto"
    >
      <option value="" disabled>Assign room</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>Room {r.room_number}</option>
      ))}
    </Select>
  );
}
