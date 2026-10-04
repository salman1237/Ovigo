"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Bus,
  CalendarDays,
  ClipboardList,
  Hotel,
  ImageIcon,
  ListTree,
  MapPin,
  Plus,
  PlusCircle,
  Settings2,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { Location } from "@/types/location";
import type { PropertySummary } from "@/types/stay";
import {
  TOUR_TYPE_LABELS,
  type DepartureTraveler,
  type MealType,
  type Tour,
  type TourType,
} from "@/types/tour";

interface SupervisedGuideItem {
  status: string;
  guide: {
    id: string;
    full_name: string;
    email: string;
  };
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const TOUR_TYPES = Object.keys(TOUR_TYPE_LABELS) as TourType[];

type RunFn = (fn: () => Promise<unknown>) => void;

export default function TourEditPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: tour, isLoading } = useQuery({
    queryKey: ["tour", id],
    queryFn: () => apiClient.get<Tour>(`/api/v1/tours/${id}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["tour", id] });

  const run: RunFn = async (fn) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  if (isLoading || !tour) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const PUBLISHED_LIKE: typeof tour.status[] = ["published", "scheduled", "booking_open", "almost_full", "sold_out", "confirmed", "in_progress", "completed"];
  const PENDING_LIKE: typeof tour.status[] = ["pending_review", "submitted_for_review"];
  const statusVariant = PUBLISHED_LIKE.includes(tour.status)
    ? "success"
    : tour.status === "rejected" || tour.status === "suspended"
      ? "danger"
      : tour.status === "changes_requested"
        ? "warning"
        : PENDING_LIKE.includes(tour.status)
          ? "warning"
          : "neutral";

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">{tour.title}</h1>
          <Badge variant={statusVariant} className="mt-2 capitalize">
            {tour.status.replace(/_/g, " ")}
          </Badge>
        </div>
        {(tour.status === "draft" || tour.status === "rejected" || tour.status === "changes_requested") && (
          <Button onClick={() => run(() => apiClient.post(`/api/v1/tours/${id}/submit`, undefined, { auth: true }))}>
            Submit for review
          </Button>
        )}
      </div>

      {tour.rejection_reason && (tour.status === "changes_requested" || tour.status === "suspended") && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <span className="font-semibold">{tour.status === "suspended" ? "Suspended: " : "Changes requested: "}</span>
          {tour.rejection_reason}
        </div>
      )}
      {tour.rejection_reason && tour.status !== "changes_requested" && tour.status !== "suspended" && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="font-semibold">Rejected: </span>
          {tour.rejection_reason}
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
            label: "Overview & Pricing",
            icon: <Settings2 className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <Section title="Photos" icon={<ImageIcon className="h-4 w-4" />}>
                  <ImageGallery basePath={`/api/v1/tours/${tour.id}`} images={tour.images} onChange={refetch} editable={!PENDING_LIKE.includes(tour.status)} />
                </Section>
                <Section title="Trust Badges" icon={<BadgeCheck className="h-4 w-4" />}>
                  <BadgeApplications entityType="tour" entityId={tour.id} />
                </Section>
                <Section title="Destinations" icon={<MapPin className="h-4 w-4" />}>
                  <LocationsSection tourId={id} run={run} />
                </Section>
                <DetailsSection tour={tour} run={run} />
              </div>
            ),
          },
          {
            key: "itinerary",
            label: "Itinerary",
            icon: <ListTree className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <ItinerarySection tour={tour} run={run} />
                <DeparturesSection tour={tour} run={run} />
              </div>
            ),
          },
          {
            key: "inclusions",
            label: "Inclusions",
            icon: <ClipboardList className="h-4 w-4" />,
            content: (
              <div className="flex flex-col gap-6">
                <MealsSection tour={tour} run={run} />
                <ActivitiesSection tour={tour} run={run} />
                <AddonsSection tour={tour} run={run} />
                <TransportSection tour={tour} run={run} />
                <StaysSection tour={tour} run={run} />
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

function ItemRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  const confirm = useConfirm();
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <span className="text-zinc-700 dark:text-zinc-300">{children}</span>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: "Remove this item?",
            description: "This can't be undone.",
            confirmLabel: "Remove",
            destructive: true,
          });
          if (ok) onRemove();
        }}
        className="shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function LocationsSection({ tourId, run }: { tourId: string; run: RunFn }) {
  const [locations, setLocations] = useState<Location[]>([]);
  return (
    <>
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
        className="mt-3"
      >
        Save destinations
      </Button>
    </>
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

function DetailsSection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [tourType, setTourType] = useState<TourType | "">(tour.tour_type ?? "");
  const [shortSummary, setShortSummary] = useState(tour.short_summary ?? "");
  const [durationNights, setDurationNights] = useState(tour.duration_nights?.toString() ?? "0");
  const [minGroupSize, setMinGroupSize] = useState(tour.min_group_size?.toString() ?? "1");

  // Pricing
  const [childPrice, setChildPrice] = useState(tour.child_price ?? "");
  const [infantPrice, setInfantPrice] = useState(tour.infant_price ?? "");
  const [pricePerGroup, setPricePerGroup] = useState(tour.price_per_group ?? "");
  const [couplePrice, setCouplePrice] = useState(tour.couple_price ?? "");
  const [singleRoomSupplement, setSingleRoomSupplement] = useState(tour.single_room_supplement ?? "");
  const [weekendPrice, setWeekendPrice] = useState(tour.weekend_price ?? "");
  const [earlyBirdDiscount, setEarlyBirdDiscount] = useState(toPercentInput(tour.early_bird_discount ?? null));
  const [groupDiscount, setGroupDiscount] = useState(toPercentInput(tour.group_discount ?? null));
  const [taxRate, setTaxRate] = useState(toPercentInput(tour.tax_rate));
  const [serviceChargeRate, setServiceChargeRate] = useState(toPercentInput(tour.service_charge_rate));
  const [depositPercentage, setDepositPercentage] = useState(toPercentInput(tour.deposit_percentage));
  const [paymentDeadlineDays, setPaymentDeadlineDays] = useState(tour.payment_deadline_days?.toString() ?? "");
  const [includedServices, setIncludedServices] = useState((tour.included_services ?? []).join(", "));
  const [excludedServices, setExcludedServices] = useState((tour.excluded_services ?? []).join(", "));

  // Logistics & Transfer
  const [pickupLocation, setPickupLocation] = useState(tour.pickup_location ?? "");
  const [pickupTime, setPickupTime] = useState(tour.pickup_time ?? "");
  const [pickupWindow, setPickupWindow] = useState(tour.pickup_window ?? "");
  const [dropoffLocation, setDropoffLocation] = useState(tour.dropoff_location ?? "");
  const [dropoffTime, setDropoffTime] = useState(tour.dropoff_time ?? "");
  const [homePickupAvailable, setHomePickupAvailable] = useState(tour.home_hotel_pickup_available ?? false);
  const [homePickupExtraCharge, setHomePickupExtraCharge] = useState(tour.home_pickup_extra_charge ?? "");
  const [lateArrivalPolicy, setLateArrivalPolicy] = useState(tour.late_arrival_policy ?? "");

  // Safety & Emergency
  const [nearestHospital, setNearestHospital] = useState(tour.nearest_hospital ?? "");
  const [firstAidAvailable, setFirstAidAvailable] = useState(tour.first_aid_available ?? true);
  const [womenSafetyNotes, setWomenSafetyNotes] = useState(tour.women_safety_notes ?? "");
  const [childSafetyNotes, setChildSafetyNotes] = useState(tour.child_safety_notes ?? "");
  const [nightTravelPolicy, setNightTravelPolicy] = useState(tour.night_travel_policy ?? "");
  const [permitRequirements, setPermitRequirements] = useState(tour.permit_requirements ?? "");
  const [insuranceIncluded, setInsuranceIncluded] = useState(tour.insurance_included ?? false);
  const [emergencyProcedure, setEmergencyProcedure] = useState(tour.emergency_procedure ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(tour.emergency_contact_phone ?? "");
  const [weatherRiskNote, setWeatherRiskNote] = useState(tour.weather_risk_note ?? "");
  const [activityRiskNote, setActivityRiskNote] = useState(tour.activity_risk_note ?? "");

  // Policies
  const [cancellationPolicy, setCancellationPolicy] = useState(tour.cancellation_policy ?? "");
  const [refundPolicy, setRefundPolicy] = useState(tour.refund_policy ?? "");
  const [childPolicy, setChildPolicy] = useState(tour.child_policy ?? "");
  const [reschedulingPolicy, setReschedulingPolicy] = useState(tour.rescheduling_policy ?? "");
  const [minParticipantPolicy, setMinParticipantPolicy] = useState(tour.min_participant_policy ?? "");
  const [badWeatherPolicy, setBadWeatherPolicy] = useState(tour.bad_weather_policy ?? "");
  const [noShowPolicy, setNoShowPolicy] = useState(tour.no_show_policy ?? "");
  const [petPolicy, setPetPolicy] = useState(tour.pet_policy ?? "");
  const [accessibilityPolicy, setAccessibilityPolicy] = useState(tour.accessibility_policy ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaving(true);
    setSaved(false);
    run(() =>
      apiClient
        .put(
          `/api/v1/tours/${tour.id}`,
          {
            tour_type: tourType || null,
            short_summary: shortSummary.trim() || null,
            duration_nights: durationNights.trim() ? Number(durationNights) : 0,
            min_group_size: minGroupSize.trim() ? Number(minGroupSize) : 1,
            child_price: childPrice.trim() || null,
            infant_price: infantPrice.trim() || null,
            price_per_group: pricePerGroup.trim() || null,
            couple_price: couplePrice.trim() || null,
            single_room_supplement: singleRoomSupplement.trim() || null,
            weekend_price: weekendPrice.trim() || null,
            early_bird_discount: fromPercentInput(earlyBirdDiscount) ?? null,
            group_discount: fromPercentInput(groupDiscount) ?? null,
            tax_rate: fromPercentInput(taxRate) ?? null,
            service_charge_rate: fromPercentInput(serviceChargeRate) ?? null,
            deposit_percentage: fromPercentInput(depositPercentage) ?? null,
            payment_deadline_days: paymentDeadlineDays.trim() ? Number(paymentDeadlineDays) : null,
            included_services: includedServices ? includedServices.split(",").map((s) => s.trim()).filter(Boolean) : [],
            excluded_services: excludedServices ? excludedServices.split(",").map((s) => s.trim()).filter(Boolean) : [],
            pickup_location: pickupLocation.trim() || null,
            pickup_time: pickupTime.trim() || null,
            pickup_window: pickupWindow.trim() || null,
            dropoff_location: dropoffLocation.trim() || null,
            dropoff_time: dropoffTime.trim() || null,
            home_hotel_pickup_available: homePickupAvailable,
            home_pickup_extra_charge: homePickupExtraCharge.trim() || null,
            late_arrival_policy: lateArrivalPolicy.trim() || null,
            nearest_hospital: nearestHospital.trim() || null,
            first_aid_available: firstAidAvailable,
            women_safety_notes: womenSafetyNotes.trim() || null,
            child_safety_notes: childSafetyNotes.trim() || null,
            night_travel_policy: nightTravelPolicy.trim() || null,
            permit_requirements: permitRequirements.trim() || null,
            insurance_included: insuranceIncluded,
            emergency_procedure: emergencyProcedure.trim() || null,
            emergency_contact_phone: emergencyContactPhone.trim() || null,
            weather_risk_note: weatherRiskNote.trim() || null,
            activity_risk_note: activityRiskNote.trim() || null,
            cancellation_policy: cancellationPolicy.trim() || null,
            refund_policy: refundPolicy.trim() || null,
            child_policy: childPolicy.trim() || null,
            rescheduling_policy: reschedulingPolicy.trim() || null,
            min_participant_policy: minParticipantPolicy.trim() || null,
            bad_weather_policy: badWeatherPolicy.trim() || null,
            no_show_policy: noShowPolicy.trim() || null,
            pet_policy: petPolicy.trim() || null,
            accessibility_policy: accessibilityPolicy.trim() || null,
          },
          { auth: true }
        )
        .then(() => setSaved(true))
        .finally(() => setSaving(false))
    );
  };

  return (
    <Section title="Tour Builder Details & Specifications" icon={<Settings2 className="h-4 w-4" />}>
      <div className="flex flex-col gap-6">
        {/* Basic Tour Metadata */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Basic Info</p>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select label="Tour type" value={tourType} onChange={(e) => setTourType(e.target.value as TourType | "")}>
              <option value="">Not set</option>
              {TOUR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TOUR_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={0}
              label="Duration Nights"
              value={durationNights}
              onChange={(e) => setDurationNights(e.target.value)}
              placeholder="e.g. 2"
            />
            <Input
              type="number"
              min={1}
              label="Min Group Size"
              value={minGroupSize}
              onChange={(e) => setMinGroupSize(e.target.value)}
              placeholder="e.g. 4"
            />
          </div>
          <div className="mt-3">
            <Input
              label="Short Summary (displayed on cards)"
              value={shortSummary}
              onChange={(e) => setShortSummary(e.target.value)}
              placeholder="e.g. 3-day guided cultural and nature trek across Sylhet tea gardens"
            />
          </div>
        </div>

        {/* Pricing & Discounts (PRD 10.3 & 10.5) */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Pricing Models & Supplements</p>
          <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="Child price (৳)" value={childPrice} onChange={(e) => setChildPrice(e.target.value)} placeholder="e.g. 6000" />
            <Input label="Infant price (৳)" value={infantPrice} onChange={(e) => setInfantPrice(e.target.value)} placeholder="Often 0" />
            <Input label="Couple price (৳)" value={couplePrice} onChange={(e) => setCouplePrice(e.target.value)} placeholder="e.g. 22000" />
            <Input label="Full Group buyout (৳)" value={pricePerGroup} onChange={(e) => setPricePerGroup(e.target.value)} placeholder="e.g. 100000" />
            <Input label="Single room supplement (৳)" value={singleRoomSupplement} onChange={(e) => setSingleRoomSupplement(e.target.value)} placeholder="e.g. 3000" />
            <Input label="Weekend price (৳)" value={weekendPrice} onChange={(e) => setWeekendPrice(e.target.value)} placeholder="e.g. 14000" />
            <Input label="Early bird discount (%)" value={earlyBirdDiscount} onChange={(e) => setEarlyBirdDiscount(e.target.value)} placeholder="e.g. 10" />
            <Input label="Group discount (%)" value={groupDiscount} onChange={(e) => setGroupDiscount(e.target.value)} placeholder="e.g. 5" />
            <Input label="Tax rate (%)" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="e.g. 5" />
            <Input label="Service charge (%)" value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)} placeholder="e.g. 3" />
            <Input label="Deposit required (%)" value={depositPercentage} onChange={(e) => setDepositPercentage(e.target.value)} placeholder="e.g. 20" />
            <Input
              type="number"
              min={0}
              label="Payment deadline (days before)"
              value={paymentDeadlineDays}
              onChange={(e) => setPaymentDeadlineDays(e.target.value)}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Textarea
              label="Included Services (comma-separated)"
              value={includedServices}
              onChange={(e) => setIncludedServices(e.target.value)}
              placeholder="All meals, AC microbus, Professional guide, Hotel stay, Forest permits"
              rows={2}
            />
            <Textarea
              label="Excluded Services (comma-separated)"
              value={excludedServices}
              onChange={(e) => setExcludedServices(e.target.value)}
              placeholder="Personal tips, Alcoholic beverages, Extra boat rides"
              rows={2}
            />
          </div>
        </div>

        {/* Pickup & Transfer Logistics (PRD 10.3) */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Pickup & Transfer Logistics</p>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Pickup location" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} placeholder="e.g. Sylhet Railway Station" />
            <Input label="Pickup time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} placeholder="e.g. 08:00 AM" />
            <Input label="Pickup window" value={pickupWindow} onChange={(e) => setPickupWindow(e.target.value)} placeholder="e.g. 30 minutes" />
            <Input label="Drop-off location" value={dropoffLocation} onChange={(e) => setDropoffLocation(e.target.value)} placeholder="e.g. Sylhet City Center" />
            <Input label="Drop-off time" value={dropoffTime} onChange={(e) => setDropoffTime(e.target.value)} placeholder="e.g. 06:00 PM" />
            <Input label="Home/Hotel pickup fee (৳)" value={homePickupExtraCharge} onChange={(e) => setHomePickupExtraCharge(e.target.value)} placeholder="e.g. 1500 (or leave 0)" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={homePickupAvailable}
                onChange={(e) => setHomePickupAvailable(e.target.checked)}
                className="rounded border-zinc-300 text-primary-600"
              />
              Doorstep / Hotel pickup is available on request
            </label>
          </div>
          <div className="mt-2">
            <Input label="Late arrival policy" value={lateArrivalPolicy} onChange={(e) => setLateArrivalPolicy(e.target.value)} placeholder="e.g. Departure departs strictly 15 minutes after window closes" />
          </div>
        </div>

        {/* Safety, Security & Emergency (PRD 10.3 & 10.6) */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Safety & Security Profile</p>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Nearest hospital & emergency center" value={nearestHospital} onChange={(e) => setNearestHospital(e.target.value)} placeholder="e.g. Sylhet Osmani Medical College Hospital" />
            <Input label="Emergency contact phone" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="+880 1711 000000" />
            <Input label="Permit requirements" value={permitRequirements} onChange={(e) => setPermitRequirements(e.target.value)} placeholder="e.g. Forest department pass required (arranged by guide)" />
            <Input label="Night travel policy" value={nightTravelPolicy} onChange={(e) => setNightTravelPolicy(e.target.value)} placeholder="e.g. Strictly no travel after 8:00 PM" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={firstAidAvailable}
                onChange={(e) => setFirstAidAvailable(e.target.checked)}
                className="rounded border-zinc-300 text-primary-600"
              />
              First-Aid Kit & Certified responder available on tour
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={insuranceIncluded}
                onChange={(e) => setInsuranceIncluded(e.target.checked)}
                className="rounded border-zinc-300 text-primary-600"
              />
              Accident & Emergency travel insurance included
            </label>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Textarea label="Women travelers safety notes" value={womenSafetyNotes} onChange={(e) => setWomenSafetyNotes(e.target.value)} rows={2} placeholder="Dedicated female guides, verified private rooms" />
            <Textarea label="Child safety notes" value={childSafetyNotes} onChange={(e) => setChildSafetyNotes(e.target.value)} rows={2} placeholder="Life jackets and harnesses provided" />
            <Textarea label="Emergency evacuation procedure" value={emergencyProcedure} onChange={(e) => setEmergencyProcedure(e.target.value)} rows={2} placeholder="Vehicle standby for medical transfers" />
            <Textarea label="Weather risk note" value={weatherRiskNote} onChange={(e) => setWeatherRiskNote(e.target.value)} rows={2} />
            <Textarea label="Activity risk note" value={activityRiskNote} onChange={(e) => setActivityRiskNote(e.target.value)} rows={2} />
          </div>
        </div>

        {/* Policies (PRD 10.3) */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Policies & Terms</p>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Textarea label="Cancellation policy" value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} rows={2} />
            <Textarea label="Refund policy" value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)} rows={2} />
            <Textarea label="Child policy" value={childPolicy} onChange={(e) => setChildPolicy(e.target.value)} rows={2} />
            <Textarea label="Rescheduling policy" value={reschedulingPolicy} onChange={(e) => setReschedulingPolicy(e.target.value)} rows={2} />
            <Textarea label="Minimum participant threshold policy" value={minParticipantPolicy} onChange={(e) => setMinParticipantPolicy(e.target.value)} rows={2} />
            <Textarea label="Bad weather cancellation policy" value={badWeatherPolicy} onChange={(e) => setBadWeatherPolicy(e.target.value)} rows={2} />
            <Textarea label="No-show & Late arrival policy" value={noShowPolicy} onChange={(e) => setNoShowPolicy(e.target.value)} rows={2} />
            <Textarea label="Pet policy" value={petPolicy} onChange={(e) => setPetPolicy(e.target.value)} rows={2} />
            <Textarea label="Accessibility policy" value={accessibilityPolicy} onChange={(e) => setAccessibilityPolicy(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <Button size="sm" onClick={save} loading={saving}>
            Save Tour Specifications
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-600">Saved successfully ✓</span>}
        </div>
      </div>
    </Section>
  );
}

function ItinerarySection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [dayNumber, setDayNumber] = useState<number>((tour.itinerary?.length ?? 0) + 1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/itinerary`,
        {
          day_number: dayNumber,
          title,
          description: description || undefined,
          location_name: locationName || undefined,
        },
        { auth: true }
      )
    );
    setTitle("");
    setDescription("");
    setLocationName("");
    setDayNumber((tour.itinerary?.length ?? 0) + 2);
  };

  const days = [...(tour.itinerary ?? [])].sort((a, b) => a.day_number - b.day_number);

  return (
    <Section title="Day-by-Day Itinerary" icon={<ListTree className="h-4 w-4" />}>
      <ul className="flex flex-col gap-3">
        {days.map((d) => (
          <li
            key={d.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block rounded-md bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-300">
                  Day {d.day_number}
                </span>
                <h4 className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{d.title}</h4>
              </div>
              <button
                type="button"
                onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/itinerary/${d.id}`, { auth: true }))}
                className="rounded-full p-1.5 text-zinc-400 hover:text-red-600"
                title="Delete day"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {d.description && <p className="text-xs text-zinc-600 dark:text-zinc-400">{d.description}</p>}
            {d.location_name && (
              <p className="text-xs text-zinc-500">
                <span className="font-medium">Destination / Area:</span> {d.location_name}
              </p>
            )}
          </li>
        ))}
        {days.length === 0 && <p className="text-sm text-zinc-400">No itinerary days added yet.</p>}
      </ul>

      <div className="mt-4 flex flex-col gap-2.5 rounded-xl border border-dashed border-zinc-300 p-3.5 dark:border-zinc-700">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            label="Day #"
            value={dayNumber}
            onChange={(e) => setDayNumber(Number(e.target.value))}
            className="w-20"
          />
          <Input
            label="Day Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Arrival in Cox's Bazar & Marine Drive"
            className="flex-1 min-w-[12rem]"
            required
          />
        </div>
        <Textarea
          label="Day Activities & Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailed breakdown of the day's schedule..."
          rows={2}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Input
            label="Destination / Stay area (optional)"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            placeholder="e.g. Inani Beach / Kolatoli"
            className="w-72"
          />
          <Button size="sm" variant="secondary" onClick={add} disabled={!title}>
            <Plus className="h-4 w-4" /> Add Day
          </Button>
        </div>
      </div>
    </Section>
  );
}

function DeparturesSection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [date, setDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [seats, setSeats] = useState(10);
  const [minSeats, setMinSeats] = useState(4);

  // Guide Assignment state
  const [assigningDepId, setAssigningDepId] = useState<string | null>(null);
  const [selectedGuideRoleId, setSelectedGuideRoleId] = useState<string>("");
  const [guideFee, setGuideFee] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  // Travelers List Modal state
  const [travelersDepId, setTravelersDepId] = useState<string | null>(null);
  const [travelersList, setTravelersList] = useState<DepartureTraveler[]>([]);
  const [loadingTravelers, setLoadingTravelers] = useState(false);

  // Fetch expert's supervised guides
  const { data: myGuides } = useQuery({
    queryKey: ["my-guides"],
    queryFn: () => apiClient.get<SupervisedGuideItem[]>("/api/v1/guides/my-guides", { auth: true }),
  });

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/departures`,
        {
          departure_date: date,
          return_date: returnDate || undefined,
          departure_time: departureTime || undefined,
          return_time: returnTime || undefined,
          available_seats: seats,
          min_participants: minSeats,
        },
        { auth: true }
      )
    );
    setDate("");
    setReturnDate("");
    setDepartureTime("");
    setReturnTime("");
  };

  const handleCancelDeparture = (depId: string) => {
    run(() => apiClient.post(`/api/v1/tours/${tour.id}/departures/${depId}/cancel`, undefined, { auth: true }));
  };

  const handleOpenAssignGuide = (depId: string) => {
    setAssigningDepId(depId);
    setSelectedGuideRoleId("");
    setGuideFee("");
  };

  const handleSaveGuideAssignment = async () => {
    if (!assigningDepId || !selectedGuideRoleId) return;
    setAssigning(true);
    try {
      await apiClient.post(
        `/api/v1/tours/${tour.id}/departures/${assigningDepId}/assign-guide`,
        {
          guide_role_id: selectedGuideRoleId,
          fee_amount: guideFee ? Number(guideFee) : null,
        },
        { auth: true }
      );
      setAssigningDepId(null);
      run(() => Promise.resolve());
    } finally {
      setAssigning(false);
    }
  };

  const handleViewTravelers = async (depId: string) => {
    setTravelersDepId(depId);
    setLoadingTravelers(true);
    try {
      const res = await apiClient.get<DepartureTraveler[]>(`/api/v1/tours/${tour.id}/departures/${depId}/travelers`, { auth: true });
      setTravelersList(res);
    } catch {
      setTravelersList([]);
    } finally {
      setLoadingTravelers(false);
    }
  };

  return (
    <Section title="Fixed Calendar Departures & Operations" icon={<CalendarDays className="h-4 w-4" />}>
      <ul className="flex flex-col gap-3">
        {tour.departures.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {d.departure_date}
                  {d.return_date ? ` → ${d.return_date}` : ""}
                </span>
                <Badge variant={d.status === "cancelled" ? "danger" : d.status === "confirmed" ? "success" : "primary"} className="capitalize">
                  {d.status}
                </Badge>
                {d.assigned_guide_role_id && (
                  <Badge variant="accent" className="text-xs">
                    Guide Assigned
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {d.available_seats} seats available · Min threshold: {d.min_participants ?? 1} travelers
                {d.departure_time ? ` · Dep: ${d.departure_time}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => handleViewTravelers(d.id)}>
                Travelers
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleOpenAssignGuide(d.id)}>
                Assign Guide
              </Button>
              {d.status !== "cancelled" && (
                <Button size="sm" variant="destructive" onClick={() => handleCancelDeparture(d.id)}>
                  Cancel Dep.
                </Button>
              )}
              <button
                type="button"
                onClick={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/departures/${d.id}`, { auth: true }))}
                className="rounded-full p-1.5 text-zinc-400 hover:text-red-600"
                title="Delete departure"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        {tour.departures.length === 0 && <p className="text-sm text-zinc-400">No scheduled departures yet.</p>}
      </ul>

      {/* Add New Departure Row */}
      <div className="mt-4 flex flex-wrap items-end gap-2.5 rounded-xl border border-dashed border-zinc-300 p-3.5 dark:border-zinc-700">
        <Input type="date" label="Departure Date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input type="date" label="Return Date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        <Input label="Dep. Time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} placeholder="08:00 AM" className="w-28" />
        <Input label="Return Time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} placeholder="06:00 PM" className="w-28" />
        <Input type="number" min={1} label="Max Seats" value={seats} onChange={(e) => setSeats(Number(e.target.value))} className="w-24" />
        <Input type="number" min={1} label="Min Pax" value={minSeats} onChange={(e) => setMinSeats(Number(e.target.value))} className="w-24" />
        <Button size="sm" variant="secondary" onClick={add} disabled={!date}>
          <Plus className="h-4 w-4" /> Add Departure
        </Button>
      </div>

      {/* Assign Guide Modal */}
      {assigningDepId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Assign Guide to Departure</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Select one of your accepted, supervised guides. High-risk activities require Level 2 certification.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Select
                label="Supervised Guide"
                value={selectedGuideRoleId}
                onChange={(e) => setSelectedGuideRoleId(e.target.value)}
              >
                <option value="">Select an accepted guide</option>
                {(myGuides ?? [])
                  .filter((g) => g.status === "accepted")
                  .map((g) => (
                    <option key={g.guide.id} value={g.guide.id}>
                      {g.guide.full_name} ({g.guide.email})
                    </option>
                  ))}
              </Select>
              <Input
                label="Guide Fee (৳)"
                value={guideFee}
                onChange={(e) => setGuideFee(e.target.value)}
                placeholder="Private fee amount, e.g. 5000"
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setAssigningDepId(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveGuideAssignment}
                  loading={assigning}
                  disabled={!selectedGuideRoleId}
                >
                  Confirm Assignment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Travelers List Modal */}
      {travelersDepId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Departure Travelers Roster</h3>
              <Button size="sm" variant="ghost" onClick={() => setTravelersDepId(null)}>
                Close
              </Button>
            </div>
            {loadingTravelers ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : travelersList.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">No confirmed bookings on this departure yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                    <tr>
                      <th className="pb-2">Traveler</th>
                      <th className="pb-2">Email</th>
                      <th className="pb-2">Seats</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {travelersList.map((t, idx) => (
                      <tr key={idx} className="py-2">
                        <td className="py-2.5 font-medium text-zinc-900 dark:text-zinc-50">{t.traveler_name}</td>
                        <td className="py-2.5 text-zinc-500">{t.traveler_email}</td>
                        <td className="py-2.5 font-semibold text-zinc-900 dark:text-zinc-50">{t.seats}</td>
                        <td className="py-2.5 capitalize text-emerald-600">{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function MealsSection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [mealType, setMealType] = useState<MealType>("breakfast");

  return (
    <Section title="Meals" icon={<UtensilsCrossed className="h-4 w-4" />}>
      <ul className="flex flex-col gap-2">
        {tour.meals.map((m) => (
          <ItemRow key={m.id} onRemove={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/meals/${m.id}`, { auth: true }))}>
            <span className="capitalize">{m.meal_type}</span>
          </ItemRow>
        ))}
        {tour.meals.length === 0 && <p className="text-sm text-zinc-400">No meals added yet.</p>}
      </ul>
      <div className="mt-4 flex gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <Select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)} className="w-auto">
          {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Button size="sm" variant="secondary" onClick={() => run(() => apiClient.post(`/api/v1/tours/${tour.id}/meals`, { meal_type: mealType }, { auth: true }))}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Section>
  );
}

function ActivitiesSection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [name, setName] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [locationName, setLocationName] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [minAge, setMinAge] = useState("");
  const [equipmentNeeded, setEquipmentNeeded] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [guideRequired, setGuideRequired] = useState(false);
  const [isHighRisk, setIsHighRisk] = useState(false);

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
          is_high_risk: isHighRisk,
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
    setIsHighRisk(false);
  };

  return (
    <Section title="Activities" icon={<ClipboardList className="h-4 w-4" />}>
      <ul className="flex flex-col gap-2">
        {tour.activities.map((a) => (
          <ItemRow key={a.id} onRemove={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/activities/${a.id}`, { auth: true }))}>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{a.name}</span>
            {a.difficulty && <span className="text-zinc-400"> · {a.difficulty}</span>}
            {a.duration_hours && <span className="text-zinc-400"> · {a.duration_hours}h</span>}
            {a.guide_required && <span className="text-zinc-400"> · guide required</span>}
            {a.is_high_risk && <span className="text-red-500"> · high risk</span>}
          </ItemRow>
        ))}
        {tour.activities.length === 0 && <p className="text-sm text-zinc-400">No activities added yet.</p>}
      </ul>
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Activity name" className="flex-1 min-w-[10rem]" />
          <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Location" className="w-32" />
          <Input value={durationHours} onChange={(e) => setDurationHours(e.target.value)} placeholder="Duration (hrs)" className="w-28" />
          <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-auto">
            <option value="">Difficulty</option>
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="challenging">Challenging</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="Min age" className="w-24" />
          <Input type="number" min={1} value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="Max capacity" className="w-28" />
          <Input value={equipmentNeeded} onChange={(e) => setEquipmentNeeded(e.target.value)} placeholder="Equipment needed" className="w-40" />
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={guideRequired} onChange={(e) => setGuideRequired(e.target.checked)} className="rounded border-zinc-300" />
            Guide required
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={isHighRisk} onChange={(e) => setIsHighRisk(e.target.checked)} className="rounded border-zinc-300" />
            High risk
          </label>
          <Button size="sm" variant="secondary" onClick={add} disabled={!name} className="ml-auto">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>
    </Section>
  );
}

function AddonsSection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  return (
    <Section title="Add-ons" icon={<PlusCircle className="h-4 w-4" />}>
      <ul className="flex flex-col gap-2">
        {tour.addons.map((a) => (
          <ItemRow key={a.id} onRemove={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/addons/${a.id}`, { auth: true }))}>
            {a.name} — {formatMoney(a.price)}
          </ItemRow>
        ))}
        {tour.addons.length === 0 && <p className="text-sm text-zinc-400">No add-ons added yet.</p>}
      </ul>
      <div className="mt-4 flex gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add-on name" className="flex-1" />
        <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" className="w-28" />
        <Button size="sm" variant="secondary" onClick={() => { run(() => apiClient.post(`/api/v1/tours/${tour.id}/addons`, { name, price }, { auth: true })); setName(""); setPrice(""); }} disabled={!name || !price}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Section>
  );
}

function TransportSection({ tour, run }: { tour: Tour; run: RunFn }) {
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
    <Section title="Transport" icon={<Bus className="h-4 w-4" />}>
      <ul className="flex flex-col gap-2">
        {tour.transport.map((t) => (
          <ItemRow key={t.id} onRemove={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/transport/${t.id}`, { auth: true }))}>
            {t.mode}
            {t.vehicle_type && <span className="text-zinc-400"> · {t.vehicle_type}</span>}
            {t.has_ac && <span className="text-zinc-400"> · AC</span>}
            {t.capacity && <span className="text-zinc-400"> · {t.capacity} seats</span>}
            {t.driver_name && <span className="text-zinc-400"> · driver: {t.driver_name}</span>}
          </ItemRow>
        ))}
        {tour.transport.length === 0 && <p className="text-sm text-zinc-400">No transport added yet.</p>}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <Input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="e.g. AC Bus" className="flex-1 min-w-[8rem]" />
        <Input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Vehicle type/model" className="w-40" />
        <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacity" className="w-24" />
        <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver (if assigned)" className="w-40" />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={hasAc} onChange={(e) => setHasAc(e.target.checked)} className="rounded border-zinc-300" />
          AC
        </label>
        <Button size="sm" variant="secondary" onClick={add} disabled={!mode} className="ml-auto">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Section>
  );
}

function StaysSection({ tour, run }: { tour: Tour; run: RunFn }) {
  const [description, setDescription] = useState("");
  const [nights, setNights] = useState(1);
  const [propertyType, setPropertyType] = useState("");
  const [roomCategory, setRoomCategory] = useState("");
  // Optionally link the stay to a real Ovigo listing: travelers can then book it
  // from the tour page, and you earn a tour-curation commission when they do.
  const [propertyQuery, setPropertyQuery] = useState("");
  const [linkedProperty, setLinkedProperty] = useState<PropertySummary | null>(null);
  const { data: propertyResults } = useQuery({
    queryKey: ["property-search", propertyQuery],
    queryFn: () => apiClient.get<PropertySummary[]>(`/api/v1/properties?q=${encodeURIComponent(propertyQuery)}`),
    enabled: propertyQuery.trim().length >= 2 && !linkedProperty,
  });

  const add = () => {
    run(() =>
      apiClient.post(
        `/api/v1/tours/${tour.id}/stays`,
        {
          description,
          nights,
          property_type: propertyType || undefined,
          room_category: roomCategory || undefined,
          property_id: linkedProperty?.id,
        },
        { auth: true }
      )
    );
    setDescription("");
    setPropertyType("");
    setRoomCategory("");
    setLinkedProperty(null);
    setPropertyQuery("");
  };

  return (
    <Section title="Stays included" icon={<Hotel className="h-4 w-4" />}>
      <ul className="flex flex-col gap-2">
        {tour.stays.map((s) => (
          <ItemRow key={s.id} onRemove={() => run(() => apiClient.delete(`/api/v1/tours/${tour.id}/stays/${s.id}`, { auth: true }))}>
            {s.description} — {s.nights} night(s)
            {s.property_type && <span className="text-zinc-400"> · {s.property_type}</span>}
            {s.room_category && <span className="text-zinc-400"> · {s.room_category}</span>}
            {s.property_id && <Badge variant="primary" className="ml-2">Bookable Ovigo stay</Badge>}
          </ItemRow>
        ))}
        {tour.stays.length === 0 && <p className="text-sm text-zinc-400">No stays added yet.</p>}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 3-star hotel" className="flex-1 min-w-[10rem]" />
        <Input type="number" min={1} value={nights} onChange={(e) => setNights(Number(e.target.value))} className="w-24" />
        <Input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} placeholder="Property type" className="w-32" />
        <Input value={roomCategory} onChange={(e) => setRoomCategory(e.target.value)} placeholder="Room/category" className="w-32" />
        <div className="w-full">
          {linkedProperty ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              Linked to <span className="font-medium">{linkedProperty.name}</span>
              <button
                type="button"
                onClick={() => setLinkedProperty(null)}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Remove link
              </button>
            </p>
          ) : (
            <>
              <Input
                value={propertyQuery}
                onChange={(e) => setPropertyQuery(e.target.value)}
                placeholder="Link an Ovigo stay (optional) — search by name"
              />
              {(propertyResults ?? []).length > 0 && (
                <ul className="mt-1 flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-700">
                  {(propertyResults ?? []).slice(0, 5).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setLinkedProperty(p);
                          if (!description) setDescription(p.name);
                          if (!propertyType) setPropertyType(p.property_type);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        {p.name} <span className="text-xs capitalize text-zinc-400">· {p.property_type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-zinc-500">
                Travelers can book a linked stay from your tour page, and you earn a curation commission when they do.
              </p>
            </>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={add} disabled={!description}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </Section>
  );
}
