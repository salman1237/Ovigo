/** What the trip is made of: where you stay, what you eat, what you do, how you
 * get around (PRD §10.3 Stay, Food Menu, Activities, Transportation). */
import {
  AlertTriangle,
  Baby,
  BedDouble,
  Bus,
  CalendarClock,
  CheckCircle2,
  CloudSun,
  Coffee,
  Gauge,
  HardHat,
  Leaf,
  Luggage,
  MapPin,
  Moon,
  Route,
  Snowflake,
  Sun,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";

import { capitalize, formatMoney, hoursLabel, plural } from "@/lib/format";
import type { Activity, Meal, Tour, TourStay, Transport } from "@/types/tour";

import { Callout, DetailList, IconBadge, Pill, SubCard, DetailSection, type Tone } from "@/components/shared/DetailSection";
import { sortMeals } from "./tour-utils";

const STAY_SOURCE: Record<string, { label: string; tone: Tone }> = {
  owned: { label: "Expert's own stay", tone: "primary" },
  referred: { label: "Partner stay", tone: "primary" },
  external: { label: "Arranged by your expert", tone: "neutral" },
};

export function StaysSection({ tour }: { tour: Tour }) {
  const nights = tour.stays.reduce((n, s) => n + s.nights, 0);
  return (
    <DetailSection id="stays" title="Where you'll stay" icon={<BedDouble />} subtitle={plural(nights, "night")} bare>
      <div className="grid gap-4 sm:grid-cols-2">
        {tour.stays.map((stay) => (
          <StayCard key={stay.id} stay={stay} tourId={tour.id} />
        ))}
      </div>
    </DetailSection>
  );
}

function StayCard({ stay, tourId }: { stay: TourStay; tourId: string }) {
  const source = STAY_SOURCE[stay.source_type ?? "external"] ?? STAY_SOURCE.external;
  const photos = (stay.stay_photos ?? []).filter((p) => /^https?:\/\//.test(p));
  return (
    <SubCard className="flex flex-col p-0">
      {photos[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photos[0]} alt={stay.stay_name ?? stay.description} className="h-40 w-full rounded-t-2xl object-cover" />
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="primary" icon={<Moon />}>
            {plural(stay.nights, "night")}
          </Pill>
          {stay.property_id ? <Pill tone="success" icon={<CheckCircle2 />}>Bookable on Ovigo</Pill> : <Pill tone={source.tone}>{source.label}</Pill>}
        </div>
        <h3 className="mt-2.5 font-semibold text-zinc-900 dark:text-zinc-50">{stay.stay_name || stay.description}</h3>
        {stay.stay_name && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{stay.description}</p>}
        {stay.stay_location && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-zinc-500">
            <MapPin className="h-3.5 w-3.5" /> {stay.stay_location}
          </p>
        )}
        <div className="mt-3">
          <DetailList
            items={[
              ["Property", stay.property_type],
              ["Room", stay.room_category],
              ["Occupancy", stay.occupancy_arrangement],
              ["Room sharing", stay.room_sharing_policy],
              ["Check-in / out", stay.check_in_out_info],
            ]}
          />
        </div>
        {stay.property_id && (
          <Link
            href={`/stays/${stay.property_id}?via_tour=${tourId}`}
            className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            View stay →
          </Link>
        )}
      </div>
    </SubCard>
  );
}

const MEAL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  breakfast: { label: "Breakfast", icon: <Coffee /> },
  lunch: { label: "Lunch", icon: <Sun /> },
  snack: { label: "Snacks & drinks", icon: <UtensilsCrossed /> },
  dinner: { label: "Dinner", icon: <Moon /> },
};

export function FoodSection({ tour }: { tour: Tour }) {
  const meals = sortMeals(tour.meals);
  const mainMeals = meals.filter((m) => m.meal_type !== "snack").length;
  const any = (pred: (m: Meal) => boolean) => meals.some(pred);
  return (
    <DetailSection
      id="food"
      title="Food & meals"
      icon={<UtensilsCrossed />}
      subtitle={`${plural(mainMeals, "meal")} included${meals.length > mainMeals ? " plus snacks" : ""}`}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {any((m) => !!m.is_halal) && <Pill tone="success">Halal options</Pill>}
        {any((m) => !!m.is_vegetarian) && <Pill tone="success" icon={<Leaf />}>Vegetarian options</Pill>}
        {any((m) => !!m.is_vegan) && <Pill tone="success" icon={<Leaf />}>Vegan options</Pill>}
        {any((m) => !!m.children_menu_available) && <Pill tone="primary" icon={<Baby />}>Children&apos;s menu</Pill>}
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {meals.map((meal) => {
          const meta = MEAL_META[meal.meal_type] ?? { label: capitalize(meal.meal_type), icon: <UtensilsCrossed /> };
          return (
            <li key={meal.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <IconBadge tone="warning" size="sm">
                {meta.icon}
              </IconBadge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {meal.day_number ? `Day ${meal.day_number} · ` : ""}
                  {meta.label}
                  {meal.restaurant_provider && <span className="font-normal text-zinc-500"> · {meal.restaurant_provider}</span>}
                </p>
                {meal.description && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{meal.description}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {meal.is_halal && <Pill>Halal</Pill>}
                  {meal.is_vegetarian && <Pill>Vegetarian</Pill>}
                  {meal.is_vegan && <Pill>Vegan</Pill>}
                  {meal.children_menu_available && <Pill>Kids&apos; menu</Pill>}
                  {meal.optional_upgrade_price && <Pill tone="warning">Upgrade +{formatMoney(meal.optional_upgrade_price)}</Pill>}
                </div>
                {meal.allergy_notes && (
                  <p className="mt-1.5 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {meal.allergy_notes}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </DetailSection>
  );
}

const DIFFICULTY_TONE: Record<string, Tone> = { easy: "success", moderate: "warning", challenging: "danger", hard: "danger" };

export function ActivitiesSection({ tour }: { tour: Tour }) {
  const included = tour.activities.filter((a) => a.is_included);
  const optional = tour.activities.filter((a) => !a.is_included);
  return (
    <DetailSection
      id="activities"
      title="Activities"
      icon={<Gauge />}
      subtitle={`${included.length} included${optional.length ? ` · ${optional.length} optional` : ""}`}
      bare
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {[...included, ...optional].map((a) => (
          <ActivityCard key={a.id} activity={a} />
        ))}
      </div>
    </DetailSection>
  );
}

function ActivityCard({ activity: a }: { activity: Activity }) {
  return (
    <SubCard className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{a.name}</h3>
        {a.is_included ? (
          <Pill tone="success">Included</Pill>
        ) : (
          <Pill tone="warning">Optional{a.addon_price ? ` · +${formatMoney(a.addon_price)}` : ""}</Pill>
        )}
      </div>
      {a.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{a.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {a.day_number && <Pill icon={<CalendarClock />}>Day {a.day_number}</Pill>}
        {hoursLabel(a.duration_hours) && <Pill>{hoursLabel(a.duration_hours)}</Pill>}
        {a.difficulty && <Pill tone={DIFFICULTY_TONE[a.difficulty.toLowerCase()] ?? "neutral"}>{capitalize(a.difficulty)}</Pill>}
        {a.min_age ? <Pill icon={<Baby />}>Age {a.min_age}+</Pill> : null}
        {a.max_capacity ? <Pill icon={<Users />}>Max {a.max_capacity}</Pill> : null}
        {a.guide_required && <Pill tone="primary">Guide-led</Pill>}
        {a.is_high_risk && <Pill tone="danger" icon={<AlertTriangle />}>High-risk activity</Pill>}
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        {a.location_name && (
          <p className="flex gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.location_name}
          </p>
        )}
        {a.equipment_needed && (
          <p className="flex gap-1.5">
            <HardHat className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.equipment_needed}
          </p>
        )}
        {a.weather_dependency && (
          <p className="flex gap-1.5">
            <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.weather_dependency}
          </p>
        )}
        {a.safety_notes && (
          <p className="flex gap-1.5 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a.safety_notes}
          </p>
        )}
      </div>
    </SubCard>
  );
}

export function TransportSection({ tour }: { tour: Tour }) {
  return (
    <DetailSection id="transport" title="Getting around" icon={<Bus />} bare>
      <div className="grid gap-4 sm:grid-cols-2">
        {tour.transport.map((t) => (
          <TransportCard key={t.id} transport={t} />
        ))}
      </div>
    </DetailSection>
  );
}

function TransportCard({ transport: t }: { transport: Transport }) {
  const vehicle = [t.vehicle_type, t.vehicle_model].filter(Boolean).join(" · ");
  return (
    <SubCard>
      <div className="flex items-start gap-3">
        <IconBadge size="sm">
          <Bus />
        </IconBadge>
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">{t.mode}</h3>
          {(t.provider_name || vehicle) && (
            <p className="text-sm text-zinc-500">{[t.provider_name, vehicle].filter(Boolean).join(" — ")}</p>
          )}
        </div>
      </div>
      {t.description && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {t.has_ac !== null && <Pill icon={<Snowflake />}>{t.has_ac ? "Air-conditioned" : "No AC"}</Pill>}
        {t.capacity ? <Pill icon={<Users />}>{t.capacity} seats</Pill> : null}
        {t.driver_included !== undefined && <Pill>{t.driver_included ? "Driver included" : "Self-drive"}</Pill>}
      </div>
      <div className="mt-3">
        <DetailList
          columns={1}
          items={[
            ["Route", t.route_info ? <span className="inline-flex gap-1"><Route className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />{t.route_info}</span> : null],
            ["Intercity", t.intercity_details],
            ["Local transfers", t.local_details],
            ["Pickup", [t.pickup_location, t.pickup_time].filter(Boolean).join(" · ") || null],
            ["Drop-off", [t.dropoff_location, t.dropoff_time].filter(Boolean).join(" · ") || null],
            ["Driver", t.driver_name],
          ]}
        />
      </div>
      {t.luggage_policy && (
        <div className="mt-3">
          <Callout icon={<Luggage className="text-zinc-500" />}>{t.luggage_policy}</Callout>
        </div>
      )}
    </SubCard>
  );
}
