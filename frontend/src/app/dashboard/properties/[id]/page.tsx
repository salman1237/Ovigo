"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ImageGallery } from "@/components/shared/ImageGallery";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { apiClient, ApiError } from "@/lib/api-client";
import type { Location } from "@/types/location";
import { AMENITY_LABELS, AmenityKey, Property } from "@/types/stay";

const ALL_AMENITIES = Object.keys(AMENITY_LABELS) as AmenityKey[];

export default function PropertyEditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: () => apiClient.get<Property>(`/api/v1/properties/${id}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["property", id] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !property) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{property.name}</h1>
          <p className="text-sm text-zinc-500">{property.status.replace("_", " ")}</p>
        </div>
        {(property.status === "draft" || property.status === "rejected") && (
          <button
            onClick={() => run(() => apiClient.post(`/api/v1/properties/${id}/submit`, undefined, { auth: true }))}
            className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Submit for review
          </button>
        )}
      </div>

      {property.rejection_reason && (
        <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Rejected: {property.rejection_reason}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Section title="Photos">
        <ImageGallery
          basePath={`/api/v1/properties/${property.id}`}
          images={property.images}
          onChange={refetch}
          editable={property.status !== "pending_review"}
        />
      </Section>

      <Section title="Destinations">
        <LocationsSection propertyId={id} run={run} />
      </Section>

      <Section title="Amenities">
        <AmenitiesSection property={property} run={run} />
      </Section>

      <Section title="Room types">
        <RoomTypesSection property={property} run={run} />
      </Section>

      <Section title="Availability calendar">
        <CalendarSection property={property} run={run} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LocationsSection({ propertyId, run }: { propertyId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <>
      <LocationPicker selected={locations} onChange={setLocations} />
      <button
        onClick={() =>
          run(() =>
            apiClient.post(`/api/v1/properties/${propertyId}/locations`, { location_ids: locations.map((l) => l.id) }, { auth: true })
          )
        }
        disabled={locations.length === 0}
        className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
      >
        Save destinations
      </button>
    </>
  );
}

function AmenitiesSection({ property, run }: { property: Property; run: (fn: () => Promise<unknown>) => void }) {
  const current = new Set(property.amenities.map((a) => a.amenity));
  const [selected, setSelected] = useState<Set<AmenityKey>>(current);

  const toggle = (key: AmenityKey) => {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelected(next);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ALL_AMENITIES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              selected.has(key)
                ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {AMENITY_LABELS[key]}
          </button>
        ))}
      </div>
      <button
        onClick={() => run(() => apiClient.put(`/api/v1/properties/${property.id}/amenities`, { amenities: Array.from(selected) }, { auth: true }))}
        className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium dark:border-zinc-700"
      >
        Save amenities
      </button>
    </>
  );
}

function RoomTypesSection({ property, run }: { property: Property; run: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState("");
  const [maxOccupancy, setMaxOccupancy] = useState(2);
  const [basePrice, setBasePrice] = useState("");
  const [totalUnits, setTotalUnits] = useState(1);

  return (
    <>
      <ul className="flex flex-col gap-1">
        {property.room_types.map((rt) => (
          <li key={rt.id} className="flex items-center justify-between text-sm">
            <span>{rt.name} — up to {rt.max_occupancy} guests, ${rt.base_price}/night, {rt.total_units} unit(s)</span>
            <button
              onClick={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/room-types/${rt.id}`, { auth: true }))}
              className="text-xs text-red-600"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <input type="number" min={1} value={maxOccupancy} onChange={(e) => setMaxOccupancy(Number(e.target.value))} placeholder="Max guests" className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="Price/night" className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <input type="number" min={1} value={totalUnits} onChange={(e) => setTotalUnits(Number(e.target.value))} placeholder="Units" className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        <button
          onClick={() => {
            run(() =>
              apiClient.post(
                `/api/v1/properties/${property.id}/room-types`,
                { name, max_occupancy: maxOccupancy, base_price: basePrice, total_units: totalUnits },
                { auth: true }
              )
            );
            setName("");
            setBasePrice("");
          }}
          disabled={!name || !basePrice}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          Add
        </button>
      </div>
    </>
  );
}

function CalendarSection({ property, run }: { property: Property; run: (fn: () => Promise<unknown>) => void }) {
  const [roomTypeId, setRoomTypeId] = useState(property.room_types[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [units, setUnits] = useState(1);

  if (property.room_types.length === 0) {
    return <p className="text-sm text-zinc-400">Add a room type first.</p>;
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900">
        {property.room_types.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.name}</option>
        ))}
      </select>
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
      <input type="number" min={0} value={units} onChange={(e) => setUnits(Number(e.target.value))} placeholder="Units available" className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
      <button
        onClick={() =>
          run(() =>
            apiClient.put(
              `/api/v1/properties/${property.id}/calendar`,
              { room_type_id: roomTypeId, start_date: startDate, end_date: endDate, available_units: units },
              { auth: true }
            )
          )
        }
        disabled={!startDate || !endDate}
        className="rounded-full border border-zinc-300 px-3 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
      >
        Set availability
      </button>
    </div>
  );
}
