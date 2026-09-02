"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BadgeApplications } from "@/components/shared/BadgeApplications";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import {
  AMENITY_LABELS,
  AmenityKey,
  HOUSEKEEPING_STATUS_LABELS,
  HousekeepingStatus,
  Property,
  RatePlan,
  RatePlanAdjustmentType,
  RatePlanType,
  RATE_PLAN_TYPE_LABELS,
  Room,
  Staff,
  StaffRole,
  STAFF_ROLE_LABELS,
} from "@/types/stay";
import Link from "next/link";

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

  if (isLoading || !property) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{property.name}</h1>
          <p className="text-sm capitalize text-zinc-500">{property.status.replace("_", " ")}</p>
        </div>
        {(property.status === "draft" || property.status === "rejected") && (
          <Button onClick={() => run(() => apiClient.post(`/api/v1/properties/${id}/submit`, undefined, { auth: true }))}>
            Submit for review
          </Button>
        )}
      </div>

      {property.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
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

      <Section title="Trust Badges">
        <BadgeApplications entityType="property" entityId={property.id} />
      </Section>

      <Section title="Destinations">
        <LocationsSection propertyId={id} run={run} />
      </Section>

      <Section title="Amenities">
        <AmenitiesSection property={property} run={run} />
      </Section>

      <Section title="Pricing & taxes">
        <PricingSection property={property} run={run} />
      </Section>

      <Section title="Room types">
        <RoomTypesSection property={property} run={run} />
      </Section>

      <Section title="Rate plans">
        <RatePlansSection property={property} />
      </Section>

      <Section title="Availability calendar">
        <CalendarSection property={property} run={run} />
      </Section>

      <Section title="Staff">
        <StaffSection property={property} />
      </Section>

      <Section title="Rooms & housekeeping">
        <RoomsSection property={property} />
      </Section>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Front desk</h2>
            <p className="mt-1 text-xs text-zinc-400">Create walk-in bookings and manage check-in/check-out for this property.</p>
          </div>
          <Link href={`/dashboard/properties/${property.id}/front-desk`}>
            <Button size="sm" variant="secondary">Open front desk</Button>
          </Link>
        </div>
      </Card>
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

function LocationsSection({ propertyId, run }: { propertyId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <>
      <LocationPicker selected={locations} onChange={setLocations} />
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          run(() =>
            apiClient.post(`/api/v1/properties/${propertyId}/locations`, { location_ids: locations.map((l) => l.id) }, { auth: true })
          )
        }
        disabled={locations.length === 0}
        className="mt-2"
      >
        Save destinations
      </Button>
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
          <button key={key} type="button" onClick={() => toggle(key)}>
            <Badge variant={selected.has(key) ? "success" : "neutral"}>{AMENITY_LABELS[key]}</Badge>
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => run(() => apiClient.put(`/api/v1/properties/${property.id}/amenities`, { amenities: Array.from(selected) }, { auth: true }))}
        className="mt-2"
      >
        Save amenities
      </Button>
    </>
  );
}

function RoomTypesSection({ property, run }: { property: Property; run: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState("");
  const [maxOccupancy, setMaxOccupancy] = useState(2);
  const [basePrice, setBasePrice] = useState("");
  const [totalUnits, setTotalUnits] = useState(1);
  const [minStayNights, setMinStayNights] = useState("");

  return (
    <>
      <ul className="flex flex-col gap-1">
        {property.room_types.map((rt) => (
          <li key={rt.id} className="flex items-center justify-between text-sm">
            <span>
              {rt.name} — up to {rt.max_occupancy} guests, {formatMoney(rt.base_price)}/night, {rt.total_units} unit(s)
              {rt.min_stay_nights ? `, min ${rt.min_stay_nights} night(s)` : ""}
            </span>
            <button
              onClick={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/room-types/${rt.id}`, { auth: true }))}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" className="flex-1" />
        <Input type="number" min={1} value={maxOccupancy} onChange={(e) => setMaxOccupancy(Number(e.target.value))} placeholder="Max guests" className="w-28" />
        <Input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="Price/night" className="w-28" />
        <Input type="number" min={1} value={totalUnits} onChange={(e) => setTotalUnits(Number(e.target.value))} placeholder="Units" className="w-24" />
        <Input type="number" min={1} value={minStayNights} onChange={(e) => setMinStayNights(e.target.value)} placeholder="Min stay (nights)" className="w-36" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            run(() =>
              apiClient.post(
                `/api/v1/properties/${property.id}/room-types`,
                {
                  name,
                  max_occupancy: maxOccupancy,
                  base_price: basePrice,
                  total_units: totalUnits,
                  min_stay_nights: minStayNights ? Number(minStayNights) : undefined,
                },
                { auth: true }
              )
            );
            setName("");
            setBasePrice("");
            setMinStayNights("");
          }}
          disabled={!name || !basePrice}
        >
          Add
        </Button>
      </div>
    </>
  );
}

function PricingSection({ property, run }: { property: Property; run: (fn: () => Promise<unknown>) => void }) {
  const [taxRate, setTaxRate] = useState(property.tax_rate ?? "");
  const [serviceChargeRate, setServiceChargeRate] = useState(property.service_charge_rate ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Tax rate (%)</label>
        <Input type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-32" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Service charge (%)</label>
        <Input type="number" min={0} max={100} step="0.01" value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)} className="w-32" />
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          run(() =>
            apiClient.put(
              `/api/v1/properties/${property.id}`,
              { tax_rate: taxRate === "" ? null : taxRate, service_charge_rate: serviceChargeRate === "" ? null : serviceChargeRate },
              { auth: true }
            )
          )
        }
      >
        Save
      </Button>
      <p className="w-full text-xs text-zinc-400">Applied to every room booking&apos;s pre-tax total at checkout. Ovigo does not take a commission on this portion.</p>
    </div>
  );
}

function RatePlansSection({ property }: { property: Property }) {
  const [roomTypeId, setRoomTypeId] = useState(property.room_types[0]?.id ?? "");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["rate-plans", roomTypeId],
    queryFn: () => apiClient.get<RatePlan[]>(`/api/v1/properties/${property.id}/room-types/${roomTypeId}/rate-plans`, { auth: true }),
    enabled: !!roomTypeId,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["rate-plans", roomTypeId] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (property.room_types.length === 0) {
    return <p className="text-sm text-zinc-400">Add a room type first.</p>;
  }

  return (
    <div>
      <Select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-auto">
        {property.room_types.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.name}</option>
        ))}
      </Select>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {(plans ?? []).map((plan) => (
            <li key={plan.id} className="flex items-center justify-between text-sm">
              <span>
                {plan.name} ({RATE_PLAN_TYPE_LABELS[plan.rate_type]}) —{" "}
                {plan.adjustment_type === "percentage" ? `${plan.adjustment_value}%` : formatMoney(plan.adjustment_value)}
                {!plan.is_active && " · inactive"}
              </span>
              <span className="flex gap-2">
                <button
                  onClick={() =>
                    run(() =>
                      apiClient.put(
                        `/api/v1/properties/${property.id}/room-types/${roomTypeId}/rate-plans/${plan.id}`,
                        { is_active: !plan.is_active },
                        { auth: true }
                      )
                    )
                  }
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
                >
                  {plan.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() =>
                    run(() =>
                      apiClient.delete(`/api/v1/properties/${property.id}/room-types/${roomTypeId}/rate-plans/${plan.id}`, { auth: true })
                    )
                  }
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {(plans ?? []).length === 0 && <p className="text-sm text-zinc-400">No rate plans yet.</p>}
        </ul>
      )}

      <RatePlanForm propertyId={property.id} roomTypeId={roomTypeId} run={run} />
    </div>
  );
}

function RatePlanForm({ propertyId, roomTypeId, run }: { propertyId: string; roomTypeId: string; run: (fn: () => Promise<unknown>) => void }) {
  const [name, setName] = useState("");
  const [rateType, setRateType] = useState<RatePlanType>("seasonal");
  const [adjustmentType, setAdjustmentType] = useState<RatePlanAdjustmentType>("percentage");
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliesToWeekends, setAppliesToWeekends] = useState(false);
  const [minDaysBeforeCheckin, setMinDaysBeforeCheckin] = useState("");
  const [minQuantity, setMinQuantity] = useState("");

  const hasCondition = startDate || endDate || appliesToWeekends || minDaysBeforeCheckin || minQuantity;

  const reset = () => {
    setName("");
    setAdjustmentValue("");
    setStartDate("");
    setEndDate("");
    setAppliesToWeekends(false);
    setMinDaysBeforeCheckin("");
    setMinQuantity("");
  };

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-900">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" className="w-40" />
      <Select value={rateType} onChange={(e) => setRateType(e.target.value as RatePlanType)} className="w-auto">
        {Object.entries(RATE_PLAN_TYPE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </Select>
      <Select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value as RatePlanAdjustmentType)} className="w-auto">
        <option value="percentage">% adjustment</option>
        <option value="fixed_price">Fixed price</option>
      </Select>
      <Input
        value={adjustmentValue}
        onChange={(e) => setAdjustmentValue(e.target.value)}
        placeholder={adjustmentType === "percentage" ? "e.g. -15 or 20" : "Fixed price"}
        className="w-32"
      />
      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Start date" />
      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="End date" />
      <Input type="number" min={0} value={minDaysBeforeCheckin} onChange={(e) => setMinDaysBeforeCheckin(e.target.value)} placeholder="Min days before check-in" className="w-44" />
      <Input type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="Min rooms" className="w-28" />
      <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" checked={appliesToWeekends} onChange={(e) => setAppliesToWeekends(e.target.checked)} />
        Weekends only
      </label>
      <Button
        size="sm"
        onClick={() => {
          run(() =>
            apiClient.post(
              `/api/v1/properties/${propertyId}/room-types/${roomTypeId}/rate-plans`,
              {
                name,
                rate_type: rateType,
                adjustment_type: adjustmentType,
                adjustment_value: adjustmentValue,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                applies_to_weekends: appliesToWeekends,
                min_days_before_checkin: minDaysBeforeCheckin ? Number(minDaysBeforeCheckin) : undefined,
                min_quantity: minQuantity ? Number(minQuantity) : undefined,
              },
              { auth: true }
            )
          );
          reset();
        }}
        disabled={!name || !adjustmentValue || !hasCondition}
      >
        Add rate plan
      </Button>
      {!hasCondition && <p className="w-full text-xs text-zinc-400">Set at least one condition (date range, weekends, min days before check-in, or min rooms).</p>}
    </div>
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
      <Select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-auto">
        {property.room_types.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.name}</option>
        ))}
      </Select>
      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      <Input type="number" min={0} value={units} onChange={(e) => setUnits(Number(e.target.value))} placeholder="Units available" className="w-36" />
      <Button
        size="sm"
        variant="secondary"
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
      >
        Set availability
      </Button>
    </div>
  );
}

function StaffSection({ property }: { property: Property }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("front_desk");

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff", property.id],
    queryFn: () => apiClient.get<Staff[]>(`/api/v1/properties/${property.id}/staff`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["staff", property.id] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="flex flex-col gap-1">
          {(staff ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>
                {s.staff_name} ({s.staff_email}) — {STAFF_ROLE_LABELS[s.staff_role]}
                {s.status !== "active" && ` · ${s.status}`}
              </span>
              {s.status !== "revoked" && (
                <button
                  onClick={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/staff/${s.id}`, { auth: true }))}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
          {(staff ?? []).length === 0 && <p className="text-sm text-zinc-400">No staff invited yet.</p>}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Staff member's Ovigo email" className="flex-1" />
        <Select value={staffRole} onChange={(e) => setStaffRole(e.target.value as StaffRole)} className="w-auto">
          {Object.entries(STAFF_ROLE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Select>
        <Button
          size="sm"
          onClick={() => {
            run(() => apiClient.post(`/api/v1/properties/${property.id}/staff`, { email, staff_role: staffRole }, { auth: true }));
            setEmail("");
          }}
          disabled={!email}
        >
          Invite
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-400">The invitee needs an existing Ovigo account and must accept before they gain access.</p>
    </div>
  );
}

function RoomsSection({ property }: { property: Property }) {
  const [roomTypeId, setRoomTypeId] = useState(property.room_types[0]?.id ?? "");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [roomNumber, setRoomNumber] = useState("");

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["rooms", roomTypeId],
    queryFn: () => apiClient.get<Room[]>(`/api/v1/properties/${property.id}/room-types/${roomTypeId}/rooms`, { auth: true }),
    enabled: !!roomTypeId,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["rooms", roomTypeId] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (property.room_types.length === 0) {
    return <p className="text-sm text-zinc-400">Add a room type first.</p>;
  }

  return (
    <div>
      <Select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-auto">
        {property.room_types.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.name}</option>
        ))}
      </Select>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {(rooms ?? []).map((room) => (
            <li key={room.id} className="flex items-center justify-between text-sm">
              <span>Room {room.room_number}</span>
              <span className="flex items-center gap-2">
                <Select
                  value={room.housekeeping_status}
                  onChange={(e) =>
                    run(() =>
                      apiClient.put(
                        `/api/v1/properties/${property.id}/rooms/${room.id}/housekeeping-status`,
                        { housekeeping_status: e.target.value as HousekeepingStatus },
                        { auth: true }
                      )
                    )
                  }
                  className="w-auto"
                >
                  {Object.entries(HOUSEKEEPING_STATUS_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
                <button
                  onClick={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/rooms/${room.id}`, { auth: true }))}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {(rooms ?? []).length === 0 && <p className="text-sm text-zinc-400">No rooms added yet.</p>}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-900">
        <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="Room number" className="w-40" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            run(() => apiClient.post(`/api/v1/properties/${property.id}/room-types/${roomTypeId}/rooms`, { room_number: roomNumber }, { auth: true }));
            setRoomNumber("");
          }}
          disabled={!roomNumber}
        >
          Add room
        </Button>
      </div>
    </div>
  );
}
