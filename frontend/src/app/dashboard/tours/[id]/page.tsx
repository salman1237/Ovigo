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
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import { TOUR_TYPE_LABELS, type MealType, type Tour, type TourType } from "@/types/tour";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const TOUR_TYPES = Object.keys(TOUR_TYPE_LABELS) as TourType[];

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

      <DetailsSection tour={tour} run={run} />
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

/** Rates are stored server-side as a decimal fraction (0.05 = 5%) — this section
 * lets the expert type a plain percentage instead of doing the math themselves. */
function toPercentInput(rate: string | null): string {
  return rate ? (Number(rate) * 100).toString() : "";
}
function fromPercentInput(value: string): number | undefined {
  return value.trim() ? Number(value) / 100 : undefined;
}

function DetailsSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [tourType, setTourType] = useState<TourType | "">(tour.tour_type ?? "");
  const [childPrice, setChildPrice] = useState(tour.child_price ?? "");
  const [infantPrice, setInfantPrice] = useState(tour.infant_price ?? "");
  const [taxRate, setTaxRate] = useState(toPercentInput(tour.tax_rate));
  const [serviceChargeRate, setServiceChargeRate] = useState(toPercentInput(tour.service_charge_rate));
  const [depositPercentage, setDepositPercentage] = useState(toPercentInput(tour.deposit_percentage));
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState(tour.payment_deadline_days?.toString() ?? "");
  const [cancellationPolicy, setCancellationPolicy] = useState(tour.cancellation_policy ?? "");
  const [refundPolicy, setRefundPolicy] = useState(tour.refund_policy ?? "");
  const [childPolicy, setChildPolicy] = useState(tour.child_policy ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(tour.emergency_contact_phone ?? "");
  const [weatherRiskNote, setWeatherRiskNote] = useState(tour.weather_risk_note ?? "");
  const [activityRiskNote, setActivityRiskNote] = useState(tour.activity_risk_note ?? "");
  const [saving, setSaving] = useState(false);

  const save = () => {
    setSaving(true);
    run(() =>
      apiClient
        .put(
          `/api/v1/tours/${tour.id}`,
          {
            tour_type: tourType || null,
            child_price: childPrice.trim() || null,
            infant_price: infantPrice.trim() || null,
            tax_rate: fromPercentInput(taxRate) ?? null,
            service_charge_rate: fromPercentInput(serviceChargeRate) ?? null,
            deposit_percentage: fromPercentInput(depositPercentage) ?? null,
            payment_deadline_days: paymentDeadlineDays.trim() ? Number(paymentDeadlineDays) : null,
            cancellation_policy: cancellationPolicy.trim() || null,
            refund_policy: refundPolicy.trim() || null,
            child_policy: childPolicy.trim() || null,
            emergency_contact_phone: emergencyContactPhone.trim() || null,
            weather_risk_note: weatherRiskNote.trim() || null,
            activity_risk_note: activityRiskNote.trim() || null,
          },
          { auth: true }
        )
        .finally(() => setSaving(false))
    );
  };

  return (
    <Section title="Tour details">
      <div className="flex flex-col gap-4">
        <Select label="Tour type" value={tourType} onChange={(e) => setTourType(e.target.value as TourType | "")}>
          <option value="">Not set</option>
          {TOUR_TYPES.map((t) => (
            <option key={t} value={t}>
              {TOUR_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pricing</p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Input label="Child price (৳)" value={childPrice} onChange={(e) => setChildPrice(e.target.value)} placeholder="Same as adult if empty" />
            <Input label="Infant price (৳)" value={infantPrice} onChange={(e) => setInfantPrice(e.target.value)} placeholder="Often free" />
            <Input label="Tax (%)" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="e.g. 5" />
            <Input label="Service charge (%)" value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)} placeholder="e.g. 3" />
            <Input label="Deposit (%)" value={depositPercentage} onChange={(e) => setDepositPercentage(e.target.value)} placeholder="e.g. 20" />
            <Input
              type="number"
              min={0}
              label="Payment deadline (days before)"
              value={paymentDeadlineDays}
              onChange={(e) => setPaymentDeadlineDays(e.target.value)}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Policies</p>
          <div className="mt-2 flex flex-col gap-3">
            <Textarea label="Cancellation policy" value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} rows={2} />
            <Textarea label="Refund policy" value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)} rows={2} />
            <Textarea label="Child policy" value={childPolicy} onChange={(e) => setChildPolicy(e.target.value)} rows={2} />
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Safety</p>
          <div className="mt-2 flex flex-col gap-3">
            <Input label="Emergency contact phone" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
            <Textarea label="Weather risk note" value={weatherRiskNote} onChange={(e) => setWeatherRiskNote(e.target.value)} rows={2} />
            <Textarea label="Activity risk note" value={activityRiskNote} onChange={(e) => setActivityRiskNote(e.target.value)} rows={2} />
          </div>
        </div>

        <Button size="sm" onClick={save} loading={saving} className="self-start">
          Save tour details
        </Button>
      </div>
    </Section>
  );
}

function ItinerarySection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [day, setDay] = useState(tour.itinerary.length + 1);
  const [title, setTitle] = useState("");
  const [locationName, setLocationName] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureTime, setDepartureTime] = useState("");

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/itinerary`,
        {
          day_number: day,
          title,
          location_name: locationName || undefined,
          arrival_time: arrivalTime || undefined,
          departure_time: departureTime || undefined,
        },
        { auth: true }
      )
    );
    setTitle("");
    setLocationName("");
    setArrivalTime("");
    setDepartureTime("");
  };

  return (
    <Section title="Itinerary">
      <ul className="flex flex-col gap-1">
        {tour.itinerary.map((d) => (
          <li key={d.id} className="flex items-center justify-between text-sm">
            <span>
              Day {d.day_number}: {d.title}
              {d.location_name && <span className="text-zinc-400"> · {d.location_name}</span>}
              {(d.arrival_time || d.departure_time) && (
                <span className="text-zinc-400"> · {d.arrival_time ?? "?"}–{d.departure_time ?? "?"}</span>
              )}
            </span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/itinerary/${d.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input type="number" min={1} value={day} onChange={(e) => setDay(Number(e.target.value))} className="w-20" />
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Day title" className="flex-1" />
        <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Location visited" className="w-40" />
        <Input value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} placeholder="Arrival, e.g. 9:00 AM" className="w-36" />
        <Input value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} placeholder="Departure" className="w-32" />
        <Button size="sm" variant="secondary" onClick={add} disabled={!title}>
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
  const [durationHours, setDurationHours] = useState("");
  const [locationName, setLocationName] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [minAge, setMinAge] = useState("");
  const [equipmentNeeded, setEquipmentNeeded] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [guideRequired, setGuideRequired] = useState(false);

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/activities`,
        {
          name,
          duration_hours: durationHours || undefined,
          location_name: locationName || undefined,
          difficulty: difficulty || undefined,
          min_age: minAge ? Number(minAge) : undefined,
          equipment_needed: equipmentNeeded || undefined,
          max_capacity: maxCapacity ? Number(maxCapacity) : undefined,
          guide_required: guideRequired,
        },
        { auth: true }
      )
    );
    setName("");
    setDurationHours("");
    setLocationName("");
    setDifficulty("");
    setMinAge("");
    setEquipmentNeeded("");
    setMaxCapacity("");
    setGuideRequired(false);
  };

  return (
    <Section title="Activities">
      <ul className="flex flex-col gap-1">
        {tour.activities.map((a) => (
          <li key={a.id} className="flex items-center justify-between text-sm">
            <span>
              {a.name}
              {a.difficulty && <span className="text-zinc-400"> · {a.difficulty}</span>}
              {a.duration_hours && <span className="text-zinc-400"> · {a.duration_hours}h</span>}
              {a.guide_required && <span className="text-zinc-400"> · guide required</span>}
            </span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/activities/${a.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Activity name" className="flex-1" />
        <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Location" className="w-32" />
        <Input value={durationHours} onChange={(e) => setDurationHours(e.target.value)} placeholder="Duration (hrs)" className="w-28" />
        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-auto">
          <option value="">Difficulty</option>
          <option value="easy">Easy</option>
          <option value="moderate">Moderate</option>
          <option value="challenging">Challenging</option>
        </Select>
        <Input type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="Min age" className="w-24" />
        <Input type="number" min={1} value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Max capacity" className="w-28" />
        <Input value={equipmentNeeded} onChange={(e) => setEquipmentNeeded(e.target.value)} placeholder="Equipment needed" className="w-40" />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={guideRequired} onChange={(e) => setGuideRequired(e.target.checked)} className="rounded border-zinc-300" />
          Guide required
        </label>
        <Button size="sm" variant="secondary" onClick={add} disabled={!name}>
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
  const [vehicleType, setVehicleType] = useState("");
  const [hasAc, setHasAc] = useState(false);
  const [capacity, setCapacity] = useState("");
  const [driverName, setDriverName] = useState("");

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/transport`,
        {
          mode,
          vehicle_type: vehicleType || undefined,
          has_ac: hasAc,
          capacity: capacity ? Number(capacity) : undefined,
          driver_name: driverName || undefined,
        },
        { auth: true }
      )
    );
    setMode("");
    setVehicleType("");
    setHasAc(false);
    setCapacity("");
    setDriverName("");
  };

  return (
    <Section title="Transport">
      <ul className="flex flex-col gap-1">
        {tour.transport.map((t) => (
          <li key={t.id} className="flex items-center justify-between text-sm">
            <span>
              {t.mode}
              {t.vehicle_type && <span className="text-zinc-400"> · {t.vehicle_type}</span>}
              {t.has_ac && <span className="text-zinc-400"> · AC</span>}
              {t.capacity && <span className="text-zinc-400"> · {t.capacity} seats</span>}
              {t.driver_name && <span className="text-zinc-400"> · driver: {t.driver_name}</span>}
            </span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/transport/${t.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="e.g. AC Bus" className="flex-1" />
        <Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Vehicle type/model" className="w-40" />
        <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacity" className="w-24" />
        <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver (if assigned)" className="w-40" />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={hasAc} onChange={(e) => setHasAc(e.target.checked)} className="rounded border-zinc-300" />
          AC
        </label>
        <Button size="sm" variant="secondary" onClick={add} disabled={!mode}>
          Add
        </Button>
      </div>
    </Section>
  );
}

function StaysSection({ tour, run }: { tour: Tour; run: (fn: () => Promise<unknown>) => void }) {
  const [description, setDescription] = useState("");
  const [nights, setNights] = useState(1);
  const [propertyType, setPropertyType] = useState("");
  const [roomCategory, setRoomCategory] = useState("");

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/stays`,
        { description, nights, property_type: propertyType || undefined, room_category: roomCategory || undefined },
        { auth: true }
      )
    );
    setDescription("");
    setPropertyType("");
    setRoomCategory("");
  };

  return (
    <Section title="Stays included">
      <ul className="flex flex-col gap-1">
        {tour.stays.map((s) => (
          <li key={s.id} className="flex items-center justify-between text-sm">
            <span>
              {s.description} — {s.nights} night(s)
              {s.property_type && <span className="text-zinc-400"> · {s.property_type}</span>}
              {s.room_category && <span className="text-zinc-400"> · {s.room_category}</span>}
            </span>
            <RemoveButton onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/stays/${s.id}`, { auth: true }))} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 3-star hotel" className="flex-1" />
        <Input type="number" min={1} value={nights} onChange={(e) => setNights(Number(e.target.value))} className="w-24" />
        <Input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} placeholder="Property type" className="w-32" />
        <Input value={roomCategory} onChange={(e) => setRoomCategory(e.target.value)} placeholder="Room/category" className="w-32" />
        <Button size="sm" variant="secondary" onClick={add} disabled={!description}>
          Add
        </Button>
      </div>
    </Section>
  );
}
