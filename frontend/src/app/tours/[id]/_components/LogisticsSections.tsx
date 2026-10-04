"use client";

/** Meeting point and safety (PRD §10.3 Pickup and Drop-Off, Security and Safety). */
import {
  Ambulance,
  BadgeCheck,
  Baby,
  Clock,
  CloudRain,
  FileCheck2,
  Home,
  MapPin,
  MoonStar,
  Navigation,
  Phone,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";
import dynamic from "next/dynamic";

import { formatMoney } from "@/lib/format";
import type { Tour } from "@/types/tour";

import { Callout, IconBadge, Pill, SubCard, DetailSection } from "@/components/shared/DetailSection";
import { pickupCoordinates } from "./tour-utils";

const RouteMap = dynamic(() => import("@/components/shared/RouteMap").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800" />,
});

export function MeetingPointSection({ tour }: { tour: Tour }) {
  const coords = pickupCoordinates(tour);
  const sameSpot = tour.pickup_location && tour.pickup_location === tour.dropoff_location;
  return (
    <DetailSection id="meeting" title="Meeting point" icon={<MapPin />}>
      <div className="grid gap-3 sm:grid-cols-2">
        {tour.pickup_location && (
          <Stop
            tone="success"
            label="Pickup"
            place={tour.pickup_location}
            lines={[
              tour.pickup_time && `Departs ${tour.pickup_time}`,
              tour.pickup_window && `Be there ${tour.pickup_window}`,
            ]}
          />
        )}
        {tour.dropoff_location && (
          <Stop
            tone="danger"
            label={sameSpot ? "Drop-off (same place)" : "Drop-off"}
            place={tour.dropoff_location}
            lines={[tour.dropoff_time && `Back around ${tour.dropoff_time}`]}
          />
        )}
      </div>
      <div className="mt-3 space-y-2">
        {tour.pickup_contact_person && (
          <Callout icon={<UserRound className="text-primary-600" />}>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">On-the-day contact: </span>
            {tour.pickup_contact_person}
          </Callout>
        )}
        {tour.home_hotel_pickup_available && (
          <Callout tone="success" icon={<Home className="text-emerald-600" />}>
            Pickup from your hotel or home is available
            {tour.home_pickup_extra_charge && Number(tour.home_pickup_extra_charge) > 0
              ? ` for ${formatMoney(tour.home_pickup_extra_charge)} extra.`
              : " at no extra cost."}
          </Callout>
        )}
        {tour.late_arrival_policy && (
          <Callout tone="warning" icon={<Clock className="text-amber-600" />} title="If you're running late">
            {tour.late_arrival_policy}
          </Callout>
        )}
      </div>
      {coords && (
        <div className="mt-4">
          <RouteMap pickup={{ label: tour.pickup_location ?? "Pickup", ...coords }} dropoff={null} height="h-56" bare className="rounded-2xl shadow-sm" />
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            <Navigation className="h-4 w-4" /> Open in Google Maps
          </a>
        </div>
      )}
    </DetailSection>
  );
}

function Stop({ tone, label, place, lines }: { tone: "success" | "danger"; label: string; place: string; lines: (string | null | undefined | false)[] }) {
  return (
    <SubCard className="flex gap-3">
      <IconBadge tone={tone} size="sm">
        <MapPin />
      </IconBadge>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
        <p className="font-semibold text-zinc-900 dark:text-zinc-50">{place}</p>
        {lines.filter(Boolean).map((line) => (
          <p key={line as string} className="text-sm text-zinc-500">
            {line}
          </p>
        ))}
      </div>
    </SubCard>
  );
}

export function hasSafetyInfo(tour: Tour): boolean {
  return Boolean(
    tour.emergency_contact_phone ||
      tour.nearest_hospital ||
      tour.women_safety_notes ||
      tour.child_safety_notes ||
      tour.night_travel_policy ||
      tour.permit_requirements ||
      tour.weather_risk_note ||
      tour.activity_risk_note ||
      tour.emergency_procedure
  );
}

export function SafetySection({ tour }: { tour: Tour }) {
  const notes: { icon: React.ReactNode; label: string; text: string | null | undefined }[] = [
    { icon: <Users />, label: "Women travelers", text: tour.women_safety_notes },
    { icon: <Baby />, label: "Children", text: tour.child_safety_notes },
    { icon: <MoonStar />, label: "Night travel", text: tour.night_travel_policy },
    { icon: <FileCheck2 />, label: "Permits & ID", text: tour.permit_requirements },
    { icon: <CloudRain />, label: "Weather", text: tour.weather_risk_note },
    { icon: <TriangleAlert />, label: "Activity risk", text: tour.activity_risk_note },
  ];
  return (
    <DetailSection id="safety" title="Safety & support" icon={<ShieldCheck />}>
      <div className="flex flex-wrap gap-1.5">
        {tour.first_aid_available !== undefined && (
          <Pill tone={tour.first_aid_available ? "success" : "warning"} icon={tour.first_aid_available ? <BadgeCheck /> : <ShieldX />}>
            {tour.first_aid_available ? "First aid on hand" : "No first-aid kit"}
          </Pill>
        )}
        {tour.insurance_included !== undefined && (
          <Pill tone={tour.insurance_included ? "success" : "neutral"} icon={tour.insurance_included ? <BadgeCheck /> : <ShieldX />}>
            {tour.insurance_included ? "Travel insurance included" : "Travel insurance not included"}
          </Pill>
        )}
      </div>
      {(tour.emergency_contact_phone || tour.nearest_hospital) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tour.emergency_contact_phone && (
            <SubCard className="flex items-center gap-3">
              <IconBadge tone="danger" size="sm">
                <Phone />
              </IconBadge>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Emergency contact</p>
                <a href={`tel:${tour.emergency_contact_phone.replace(/\s/g, "")}`} className="font-semibold text-zinc-900 hover:text-primary-600 dark:text-zinc-50">
                  {tour.emergency_contact_phone}
                </a>
              </div>
            </SubCard>
          )}
          {tour.nearest_hospital && (
            <SubCard className="flex items-center gap-3">
              <IconBadge tone="danger" size="sm">
                <Ambulance />
              </IconBadge>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Nearest hospital</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{tour.nearest_hospital}</p>
              </div>
            </SubCard>
          )}
        </div>
      )}
      {notes.some((n) => n.text) && (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {notes
            .filter((n) => n.text)
            .map((n) => (
              <div key={n.label} className="flex gap-3">
                <span className="mt-0.5 text-primary-600 dark:text-primary-400 [&>svg]:h-4 [&>svg]:w-4">{n.icon}</span>
                <div>
                  <dt className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{n.label}</dt>
                  <dd className="text-sm text-zinc-600 dark:text-zinc-400">{n.text}</dd>
                </div>
              </div>
            ))}
        </dl>
      )}
      {tour.emergency_procedure && (
        <div className="mt-4">
          <Callout tone="danger" icon={<TriangleAlert className="text-red-600" />} title="In an emergency">
            {tour.emergency_procedure}
          </Callout>
        </div>
      )}
    </DetailSection>
  );
}
