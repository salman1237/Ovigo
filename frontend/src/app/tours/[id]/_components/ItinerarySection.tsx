"use client";

import { Accessibility, Clock, Coffee, MapPin, Moon, ShieldAlert, Sun, Ticket, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

import { capitalize, formatDay, formatMoney, hoursLabel } from "@/lib/format";
import type { Activity, Departure, Meal, Tour } from "@/types/tour";

import { Pill, DetailSection } from "@/components/shared/DetailSection";
import { groupByDay, MEAL_ORDER, visitDate } from "./tour-utils";

const COLLAPSED_DAYS = 4;

const MEAL_ICON: Record<string, React.ReactNode> = {
  breakfast: <Coffee />,
  lunch: <Sun />,
  dinner: <Moon />,
  snack: <UtensilsCrossed />,
};

/** Day-by-day timeline. Activities and meals the expert tied to a day appear inside
 * that day; with a departure picked, each day shows its real calendar date. */
export function ItinerarySection({ tour, departure }: { tour: Tour; departure: Departure | null }) {
  const [expanded, setExpanded] = useState(false);
  const days = [...tour.itinerary].sort((a, b) => a.day_number - b.day_number);
  const activitiesByDay = groupByDay(tour.activities);
  const mealsByDay = groupByDay(tour.meals);
  const visible = expanded ? days : days.slice(0, COLLAPSED_DAYS);

  return (
    <DetailSection
      id="itinerary"
      title="Itinerary"
      icon={<MapPin />}
      subtitle={departure ? `Dates shown for the ${formatDay(departure.departure_date)} departure` : "Pick a departure to see the dates"}
    >
      <ol className="relative">
        {visible.map((day, i) => {
          const activities = activitiesByDay.get(day.day_number) ?? [];
          const meals = [...(mealsByDay.get(day.day_number) ?? [])].sort(
            (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
          );
          const last = i === visible.length - 1;
          return (
            <li key={day.id} className="relative flex gap-4 pb-8 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[19px] top-11 h-[calc(100%-2.75rem)] w-0.5 rounded bg-gradient-to-b from-primary-300 to-zinc-200 dark:from-primary-800 dark:to-zinc-800" />}
              <div className="relative z-10 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/25">
                <span className="text-[9px] font-semibold uppercase leading-none opacity-80">Day</span>
                <span className="text-sm font-bold leading-none">{day.day_number}</span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                {departure && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                    {formatDay(visitDate(departure, day.day_number))}
                  </p>
                )}
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{day.title}</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {day.location_name && <Pill icon={<MapPin />}>{day.location_name}</Pill>}
                  {day.arrival_time && <Pill icon={<Clock />}>Arrive {day.arrival_time}</Pill>}
                  {day.departure_time && <Pill icon={<Clock />}>Leave {day.departure_time}</Pill>}
                  {day.entry_fee_included !== undefined && (
                    <Pill tone={day.entry_fee_included ? "success" : "warning"} icon={<Ticket />}>
                      {day.entry_fee_included ? "Entry fees included" : "Entry fees not included"}
                    </Pill>
                  )}
                </div>
                {day.description && <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{day.description}</p>}
                {day.activity_summary && (
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Highlights: </span>
                    {day.activity_summary}
                  </p>
                )}
                {(activities.length > 0 || meals.length > 0) && (
                  <div className="mt-3 space-y-2 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
                    {activities.map((a) => (
                      <DayActivity key={a.id} activity={a} />
                    ))}
                    {meals.length > 0 && <DayMeals meals={meals} />}
                  </div>
                )}
                {(day.accessibility_notes || day.safety_notes) && (
                  <div className="mt-2.5 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {day.accessibility_notes && (
                      <p className="flex gap-1.5">
                        <Accessibility className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {day.accessibility_notes}
                      </p>
                    )}
                    {day.safety_notes && (
                      <p className="flex gap-1.5 text-amber-700 dark:text-amber-400">
                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {day.safety_notes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {days.length > COLLAPSED_DAYS && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 w-full rounded-2xl border border-dashed border-zinc-300 py-2.5 text-sm font-semibold text-primary-600 transition hover:border-primary-300 hover:bg-primary-50/50 dark:border-zinc-700 dark:text-primary-400 dark:hover:bg-primary-950/20"
        >
          {expanded ? "Show fewer days" : `Show all ${days.length} days`}
        </button>
      )}
    </DetailSection>
  );
}

function DayActivity({ activity }: { activity: Activity }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="font-medium text-zinc-800 dark:text-zinc-200">{activity.name}</span>
      {hoursLabel(activity.duration_hours) && <span className="text-xs text-zinc-500">· {hoursLabel(activity.duration_hours)}</span>}
      {activity.difficulty && <span className="text-xs text-zinc-500">· {capitalize(activity.difficulty)}</span>}
      {!activity.is_included && (
        <Pill tone="warning" className="ml-auto">
          Optional{activity.addon_price ? ` · +${formatMoney(activity.addon_price)}` : ""}
        </Pill>
      )}
    </div>
  );
}

function DayMeals({ meals }: { meals: Meal[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-zinc-200/70 pt-2 first:border-0 first:pt-0 dark:border-zinc-700/60">
      {meals.map((m) => (
        <Pill key={m.id} tone="primary" icon={MEAL_ICON[m.meal_type]}>
          {capitalize(m.meal_type)}
        </Pill>
      ))}
    </div>
  );
}
