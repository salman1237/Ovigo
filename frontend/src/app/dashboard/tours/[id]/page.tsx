"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BadgeApplications } from "@/components/shared/BadgeApplications";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import type { MealType, Tour } from "@/types/tour";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export default function TourEditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: tour, isLoading } = useQuery({
    queryKey: ["tour", id],
    queryFn: () => apiClient.get<Tour>(`/api/v1/tours/${id}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["tour", id] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !tour) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{tour.title}</h1>
          <p className="text-sm capitalize text-zinc-500">{tour.status.replace("_", " ")}</p>
        </div>
        {(tour.status === "draft" || tour.status === "rejected") && (
          <Button onClick={() => run(() => apiClient.post(`/api/v1/tours/${id}/submit`, undefined, { auth: true }))}>
            Submit for review
          </Button>
        )}
      </div>

      {tour.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          Rejected: {tour.rejection_reason}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Section title="Photos">
        <ImageGallery basePath={`/api/v1/tours/${tour.id}`} images={tour.images} onChange={refetch} editable={tour.status !== "pending_review"} />
      </Section>

      <Section title="Trust Badges">
        <BadgeApplications entityType="tour" entityId={tour.id} />
      </Section>

      <LocationsSection tourId={id} run={run} />
      <ItinerarySection tour={tour} run={run} />
      <DeparturesSection tour={tour} run={run} />
      <MealsSection tour={tour} run={run} />
      <ActivitiesSection tour={tour} run={run} />
      <AddonsSection tour={tour} run={run} />
      <TransportSection tour={tour} run={run} />
      <StaysSection tour={tour} run={run} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-6">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs font-medium text-red-600 hover:text-red-700">
      Remove
    </button>
  );
}

function LocationsSection({ tourId, run }: { tourId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <Section title="Destinations">
      <LocationPicker selected={locations} onChange={setLocations} />
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          run(() =>
            apiClient.post(`/api/v1/tours/${tourId}/locations`, { location_ids: locations.map((l) => l.id) }, { auth: true })
          )
        }
        disabled={locations.length === 0}
        className="mt-2"
      >
        Save destinations
      </Button>
    </Section>
  );
}

function ItinerarySection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [day, setDay] = useState(tour.itinerary.length + 1);
  const [title, setTitle] = useState("");

  return (
    <Section title="Itinerary">
      <ul className="flex flex-col gap-1">
        {tour.itinerary.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm">
            <span>Day {d.day_number}: {d.title}</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/itinerary/${d.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input type="number" min={1} value={day} onChange={(e) => setDay(Number(e.target.value))} className="w-20" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Day title" className="flex-1" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => { run(() => apiClient.post(`/api/v1/tours/${tour.id}/itinerary`, { day_number: day, title }, { auth: true })); setTitle(""); }}
          disabled={!title}
        >
          Add
        </Button>
      </div>
    </Section>
  );
}

function DeparturesSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [date, setDate] = useState("");
  const [seats, setSeats] = useState(10);

  return (
    <Section title="Departure dates">
      <ul className="flex flex-col gap-1">
        {tour.departures.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm">
            <span>{d.departure_date} — {d.available_seats} seats</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/departures/${d.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="w-24" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => run(() => apiClient.post(`/api/v1/tours/${tour.id}/departures`, { departure_date: date, available_seats: seats }, { auth: true }))}
          disabled={!date}
        >
          Add
        </Button>
      </div>
    </Section>
  );
}

function MealsSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [mealType, setMealType] = useState<MealType>("breakfast");

  return (
    <Section title="Meals">
      <ul className="flex flex-col gap-1">
        {tour.meals.map((m) => (
          <li key={m.id} className="flex items-center justify-between text-sm capitalize">
            <span>{m.meal_type}</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/meals/${m.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} className="w-auto">
          {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Button size="sm" variant="secondary" onClick={() => run(() => apiClient.post(`/api/v1/tours/${tour.id}/meals`, { meal_type: mealType }, { auth: true }))}>
          Add
        </Button>
      </div>
    </Section>
  );
}

function ActivitiesSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState("");
  return (
    <Section title="Activities">
      <ul className="flex flex-col gap-1">
        {tour.activities.map((a) => (
          <li key={a.id} className="flex items-center justify-between text-sm">
            <span>{a.name}</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/activities/${a.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Activity name" className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => { run(() => apiClient.post(`/api/v1/tours/${tour.id}/activities`, { name }, { auth: true })); setName(""); }} disabled={!name}>
          Add
        </Button>
      </div>
    </Section>
  );
}

function AddonsSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <Section title="Add-ons">
      <ul className="flex flex-col gap-1">
        {tour.addons.map((a) => (
          <li key={a.id} className="flex items-center justify-between text-sm">
            <span>{a.name} — {formatMoney(a.price)}</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/addons/${a.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add-on name" className="flex-1" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" className="w-28" />
        <Button size="sm" variant="secondary" onClick={() => { run(() => apiClient.post(`/api/v1/tours/${tour.id}/addons`, { name, price }, { auth: true })); setName(""); setPrice(""); }} disabled={!name || !price}>
          Add
        </Button>
      </div>
    </Section>
  );
}

function TransportSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [mode, setMode] = useState("");
  return (
    <Section title="Transport">
      <ul className="flex flex-col gap-1">
        {tour.transport.map((t) => (
          <li key={t.id} className="flex items-center justify-between text-sm">
            <span>{t.mode}</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/transport/${t.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="e.g. AC Bus" className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => { run(() => apiClient.post(`/api/v1/tours/${tour.id}/transport`, { mode }, { auth: true })); setMode(""); }} disabled={!mode}>
          Add
        </Button>
      </div>
    </Section>
  );
}

function StaysSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [description, setDescription] = useState("");
  const [nights, setNights] = useState(1);
  return (
    <Section title="Stays included">
      <ul className="flex flex-col gap-1">
        {tour.stays.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm">
            <span>{s.description} — {s.nights} night(s)</span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/stays/${s.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 3-star hotel" className="flex-1" />
        <Input type="number" min={1} value={nights} onChange={(e) => setNights(Number(e.target.value))} className="w-24" />
        <Button size="sm" variant="secondary" onClick={() => { run(() => apiClient.post(`/api/v1/tours/${tour.id}/stays`, { description, nights }, { auth: true })); setDescription(""); }} disabled={!description}>
          Add
        </Button>
      </div>
    </Section>
  );
}
