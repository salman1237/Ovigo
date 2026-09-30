"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  BedDouble,
  CalendarClock,
  CalendarSync,
  ImageIcon,
  MapPin,
  Plus,
  Sparkles,
  Tags,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BadgeApplications } from "@/components/shared/BadgeApplications";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { LocationPicker } from "@/components/shared/LocationPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { apiClient, ApiError } from "@/lib/api-client";
import { API_URL } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import {
  AMENITY_LABELS,
  AmenityKey,
  HOUSEKEEPING_STATUS_LABELS,
  HousekeepingStatus,
  IcalToken,
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

const ALL_AMENITIES = Object.keys(AMENITY_LABELS) as AmenityKey[];

type RunFn = (fn: () => Promise<unknown>) => void;

export default function PropertyEditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: () => apiClient.get<Property>(`/api/v1/properties/${id}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["property", id] });

  const run: RunFn = async (fn) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !property) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const statusVariant = property.status === "published" ? "success" : property.status === "rejected" ? "danger" : property.status === "pending_review" ? "warning" : "neutral";

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">{property.name}</h1>
          <Badge variant={statusVariant} className="mt-2 capitalize">
            {property.status.replace("_", " ")}
          </Badge>
        </div>
        {(property.status === "draft" || property.status === "rejected") && (
          <Button onClick={() => run(() => apiClient.post(`/api/v1/properties/${id}/submit`, undefined, { auth: true }))}>
            Submit for review
          </Button>
        )}
      </div>

      {property.rejection_reason && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="font-semibold">Rejected: </span>
          {property.rejection_reason}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <Tabs
        className="mt-8"
        items={[
          {
            key: "overview",
            label: "Overview",
            icon: <ImageIcon className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <Section title="Photos" icon={<ImageIcon className="h-4 w-4" />}>
                  <ImageGallery
                    basePath={`/api/v1/properties/${property.id}`}
                    images={property.images}
                    onChange={refetch}
                    editable={property.status !== "pending_review"}
                  />
                </Section>
                <Section title="Trust Badges" icon={<BadgeCheck className="h-4 w-4" />}>
                  <BadgeApplications entityType="property" entityId={property.id} />
                </Section>
                <Section title="Destinations" icon={<MapPin className="h-4 w-4" />}>
                  <LocationsSection propertyId={id} run={run} />
                </Section>
                <Section title="Amenities" icon={<Sparkles className="h-4 w-4" />}>
                  <AmenitiesSection property={property} run={run} />
                </Section>
              </div>
            ),
          },
          {
            key: "pricing",
            label: "Pricing & Rooms",
            icon: <Tags className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <Section title="Pricing & taxes" icon={<Tags className="h-4 w-4" />}>
                  <PricingSection property={property} run={run} />
                </Section>
                <Section title="Room types" icon={<BedDouble className="h-4 w-4" />}>
                  <RoomTypesSection property={property} run={run} />
                </Section>
                <Section title="Rate plans" icon={<Tags className="h-4 w-4" />}>
                  <RatePlansSection property={property} />
                </Section>
              </div>
            ),
          },
          {
            key: "availability",
            label: "Availability & Sync",
            icon: <CalendarClock className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <Section title="Availability calendar" icon={<CalendarClock className="h-4 w-4" />}>
                  <CalendarSection property={property} run={run} />
                </Section>
                <Section title="Calendar sync (iCal)" icon={<CalendarSync className="h-4 w-4" />}>
                  <CalendarSyncSection property={property} />
                </Section>
              </div>
            ),
          },
          {
            key: "staff",
            label: "Staff & Rooms",
            icon: <Users className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <Section title="Staff" icon={<Users className="h-4 w-4" />}>
                  <StaffSection property={property} />
                </Section>
                <Section title="Rooms & housekeeping" icon={<BedDouble className="h-4 w-4" />}>
                  <RoomsSection property={property} />
                </Section>
                <Card variant="elevated">
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
            ),
          },
        ]}
      />
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="elevated">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {icon && <span className="text-primary-600 dark:text-primary-400">{icon}</span>}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function ItemRow({ children, onRemove, removeLabel = "Remove" }: { children: React.ReactNode; onRemove: () => void; removeLabel?: string }) {
  const confirm = useConfirm();
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <span className="text-zinc-700 dark:text-zinc-300">{children}</span>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: `${removeLabel} this item?`,
            description: "This can't be undone.",
            confirmLabel: removeLabel,
            destructive: true,
          });
          if (ok) onRemove();
        }}
        className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        aria-label={removeLabel}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function LocationsSection({ propertyId, run }: { propertyId: string; run: RunFn }) {
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
        className="mt-3"
      >
        Save destinations
      </Button>
    </>
  );
}

function AmenitiesSection({ property, run }: { property: Property; run: RunFn }) {
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
        className="mt-3"
      >
        Save amenities
      </Button>
    </>
  );
}

function RoomTypesSection({ property, run }: { property: Property; run: RunFn }) {
  const [name, setName] = useState("");
  const [maxOccupancy, setMaxOccupancy] = useState(2);
  const [basePrice, setBasePrice] = useState("");
  const [totalUnits, setTotalUnits] = useState(1);
  const [minStayNights, setMinStayNights] = useState("");

  return (
    <>
      <ul className="flex flex-col gap-2">
        {property.room_types.map((rt) => (
          <ItemRow key={rt.id} onRemove={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/room-types/${rt.id}`, { auth: true }))}>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{rt.name}</span> — up to {rt.max_occupancy} guests, {formatMoney(rt.base_price)}/night, {rt.total_units} unit(s)
            {rt.min_stay_nights ? `, min ${rt.min_stay_nights} night(s)` : ""}
          </ItemRow>
        ))}
        {property.room_types.length === 0 && <p className="text-sm text-zinc-400">No room types added yet.</p>}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" className="flex-1 min-w-[10rem]" />
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
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </>
  );
}

function PricingSection({ property, run }: { property: Property; run: RunFn }) {
  const [taxRate, setTaxRate] = useState(property.tax_rate ?? "");
  const [serviceChargeRate, setServiceChargeRate] = useState(property.service_charge_rate ?? "");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Tax rate (%)" type="number" min={0} max={100} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="w-32" />
      <Input label="Service charge (%)" type="number" min={0} max={100} step="0.01" value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)} className="w-32" />
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

  const run: RunFn = async (fn) => {
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
        <ul className="mt-3 flex flex-col gap-2">
          {(plans ?? []).map((plan) => (
            <li key={plan.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{plan.name}</span> ({RATE_PLAN_TYPE_LABELS[plan.rate_type]}) —{" "}
                {plan.adjustment_type === "percentage" ? `${plan.adjustment_value}%` : formatMoney(plan.adjustment_value)}
                {!plan.is_active && <Badge variant="neutral" className="ml-2">inactive</Badge>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
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
                  className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                >
                  {plan.is_active ? "Deactivate" : "Activate"}
                </button>
                <RemoveIconButton
                  label="Remove this rate plan?"
                  onRemove={() =>
                    run(() =>
                      apiClient.delete(`/api/v1/properties/${property.id}/room-types/${roomTypeId}/rate-plans/${plan.id}`, { auth: true })
                    )
                  }
                />
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

function RemoveIconButton({ onRemove, label }: { onRemove: () => void; label: string }) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirm({ title: label, description: "This can't be undone.", confirmLabel: "Remove", destructive: true });
        if (ok) onRemove();
      }}
      className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
      aria-label="Remove"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function RatePlanForm({ propertyId, roomTypeId, run }: { propertyId: string; roomTypeId: string; run: RunFn }) {
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
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <div className="flex flex-wrap gap-2">
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
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        <Input label="Min days before check-in" type="number" min={0} value={minDaysBeforeCheckin} onChange={(e) => setMinDaysBeforeCheckin(e.target.value)} className="w-44" />
        <Input label="Min rooms" type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="w-28" />
        <label className="flex items-center gap-1.5 pb-2.5 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={appliesToWeekends} onChange={(e) => setAppliesToWeekends(e.target.checked)} className="rounded border-zinc-300" />
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
          className="ml-auto"
        >
          <Plus className="h-4 w-4" /> Add rate plan
        </Button>
      </div>
      {!hasCondition && <p className="text-xs text-zinc-400">Set at least one condition (date range, weekends, min days before check-in, or min rooms).</p>}
    </div>
  );
}

function CalendarSection({ property, run }: { property: Property; run: RunFn }) {
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
      <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      <Input label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      <Input label="Units available" type="number" min={0} value={units} onChange={(e) => setUnits(Number(e.target.value))} className="w-36" />
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

function CalendarSyncSection({ property }: { property: Property }) {
  const [roomTypeId, setRoomTypeId] = useState(property.room_types[0]?.id ?? "");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "regenerate" | "import" | null>(null);
  const [token, setToken] = useState<IcalToken | null>(null);

  const loadToken = async (rtId: string) => {
    setBusy("load");
    setError(null);
    try {
      setToken(await apiClient.get<IcalToken>(`/api/v1/properties/${property.id}/room-types/${rtId}/ical-token`, { auth: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load calendar feed");
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setBusy("regenerate");
    setError(null);
    try {
      setToken(
        await apiClient.post<IcalToken>(`/api/v1/properties/${property.id}/room-types/${roomTypeId}/ical-token/regenerate`, undefined, { auth: true })
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to regenerate feed");
    } finally {
      setBusy(null);
    }
  };

  const importCalendar = async () => {
    setBusy("import");
    setError(null);
    setResult(null);
    try {
      const res = await apiClient.post<{ blocked_dates_count: number }>(
        `/api/v1/properties/${property.id}/room-types/${roomTypeId}/ical-import`,
        { source_url: sourceUrl },
        { auth: true }
      );
      setResult(`Blocked ${res.blocked_dates_count} date(s) from the external calendar.`);
      setSourceUrl("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to import calendar");
    } finally {
      setBusy(null);
    }
  };

  if (property.room_types.length === 0) {
    return <p className="text-sm text-zinc-400">Add a room type first.</p>;
  }

  const feedUrl = token ? `${API_URL}${token.feed_path}?token=${token.ical_token}` : null;

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={roomTypeId}
        onChange={(e) => {
          setRoomTypeId(e.target.value);
          setToken(null);
        }}
        className="w-auto"
      >
        {property.room_types.map((rt) => (
          <option key={rt.id} value={rt.id}>{rt.name}</option>
        ))}
      </Select>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Export</p>
        <p className="mt-1 text-xs text-zinc-500">Subscribe from Google Calendar, Outlook, etc.</p>
        {feedUrl ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input value={feedUrl} readOnly className="flex-1 min-w-[12rem]" onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="secondary" onClick={regenerate} loading={busy === "regenerate"}>
              Regenerate link
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => loadToken(roomTypeId)} loading={busy === "load"}>
            Get calendar link
          </Button>
        )}
      </div>

      <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/40">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Import</p>
        <p className="mt-1 text-xs text-zinc-500">Paste an external calendar&apos;s export link (e.g. Airbnb, Booking.com) to block those dates here.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://...calendar.ics" className="flex-1 min-w-[12rem]" />
          <Button size="sm" onClick={importCalendar} loading={busy === "import"} disabled={!sourceUrl}>
            Import
          </Button>
        </div>
        {result && <p className="mt-2 text-sm text-emerald-600">{result}</p>}
      </div>
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

  const run: RunFn = async (fn) => {
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
        <ul className="flex flex-col gap-2">
          {(staff ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="text-zinc-700 dark:text-zinc-300">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{s.staff_name}</span> ({s.staff_email}) — {STAFF_ROLE_LABELS[s.staff_role]}
                {s.status !== "active" && <Badge variant="neutral" className="ml-2 capitalize">{s.status}</Badge>}
              </span>
              {s.status !== "revoked" && (
                <RemoveIconButton
                  label="Revoke this staff member's access?"
                  onRemove={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/staff/${s.id}`, { auth: true }))}
                />
              )}
            </li>
          ))}
          {(staff ?? []).length === 0 && <p className="text-sm text-zinc-400">No staff invited yet.</p>}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Staff member's Ovigo email" className="flex-1 min-w-[10rem]" />
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
          <Plus className="h-4 w-4" /> Invite
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

  const run: RunFn = async (fn) => {
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
        <ul className="mt-3 flex flex-col gap-2">
          {(rooms ?? []).map((room) => (
            <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Room {room.room_number}</span>
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
                <RemoveIconButton
                  label={`Remove Room ${room.room_number}?`}
                  onRemove={() => run(() => apiClient.delete(`/api/v1/properties/${property.id}/rooms/${room.id}`, { auth: true }))}
                />
              </span>
            </li>
          ))}
          {(rooms ?? []).length === 0 && <p className="text-sm text-zinc-400">No rooms added yet.</p>}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
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
          <Plus className="h-4 w-4" /> Add room
        </Button>
      </div>
    </div>
  );
}
