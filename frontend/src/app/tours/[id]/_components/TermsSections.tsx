/** What's included, prices, extras and policies (PRD §10.3 Included / Excluded
 * Services, Pricing, Add-Ons, Policies). */
import { Check, ChevronDown, FileText, Gift, Info, ReceiptText, Sparkles, X } from "lucide-react";

import { formatMoney, percent } from "@/lib/format";
import type { Tour } from "@/types/tour";

import { Callout, Pill, SubCard, DetailSection } from "@/components/shared/DetailSection";

export function IncludedSection({ tour }: { tour: Tour }) {
  const included = tour.included_services ?? [];
  const excluded = tour.excluded_services ?? [];
  return (
    <DetailSection id="included" title="What's included" icon={<Sparkles />}>
      <div className="grid gap-6 sm:grid-cols-2">
        {included.length > 0 && (
          <ul className="space-y-2.5">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        )}
        {excluded.length > 0 && (
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Not included</p>
            <ul className="space-y-2.5">
              {excluded.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                    <X className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

function money(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return Number(value) === 0 ? "Free" : formatMoney(value);
}

export function PricingSection({ tour }: { tour: Tour }) {
  const seasonal = Object.entries(tour.seasonal_pricing ?? {}).filter(([, v]) => v !== null && v !== "");
  const rates: [string, string | null, string?][] = [
    ["Adult", money(tour.base_price), "per person"],
    ["Child", money(tour.child_price), "per child"],
    ["Infant", money(tour.infant_price), "per infant"],
    ["Couple", money(tour.couple_price), "for two"],
    ["Private group", money(tour.price_per_group), "whole group"],
    ["Weekend departures", money(tour.weekend_price), "per person"],
    ["Single room supplement", money(tour.single_room_supplement), "extra"],
  ];
  const discounts = [
    tour.early_bird_discount && `${percent(tour.early_bird_discount)} early-bird discount`,
    tour.group_discount && `${percent(tour.group_discount)} group discount`,
  ].filter(Boolean) as string[];
  const charges = [
    tour.tax_rate && `${percent(tour.tax_rate)} tax`,
    tour.service_charge_rate && `${percent(tour.service_charge_rate)} service charge`,
  ].filter(Boolean) as string[];

  return (
    <DetailSection id="pricing" title="Prices" icon={<ReceiptText />}>
      <div className="grid gap-x-8 sm:grid-cols-2">
        {rates
          .filter(([, value]) => value)
          .map(([label, value, unit]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-dashed border-zinc-200 py-2.5 dark:border-zinc-800">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {value} {unit && value !== "Free" && <span className="font-normal text-zinc-400">{unit}</span>}
              </span>
            </div>
          ))}
        {seasonal.map(([season, value]) => (
          <div key={season} className="flex items-baseline justify-between gap-3 border-b border-dashed border-zinc-200 py-2.5 dark:border-zinc-800">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{season}</span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {money(String(value))} <span className="font-normal text-zinc-400">per person</span>
            </span>
          </div>
        ))}
      </div>
      {(discounts.length > 0 || charges.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {discounts.map((d) => (
            <Pill key={d} tone="success">
              {d}
            </Pill>
          ))}
          {charges.map((c) => (
            <Pill key={c}>+ {c}</Pill>
          ))}
        </div>
      )}
      {tour.deposit_percentage && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Payment: </span>
          {percent(tour.deposit_percentage)} deposit to reserve
          {tour.payment_deadline_days ? `, the rest due ${tour.payment_deadline_days} days before departure` : ""}.
        </p>
      )}
      <div className="mt-4">
        <Callout tone="primary" icon={<Info className="text-primary-600" />}>
          Online checkout currently charges the per-person price for every traveler. For child, infant, couple or group
          rates, message your expert before you book.
        </Callout>
      </div>
    </DetailSection>
  );
}

export function ExtrasSection({ tour }: { tour: Tour }) {
  return (
    <DetailSection id="extras" title="Optional extras" icon={<Gift />} subtitle="Arrange these with your expert" bare>
      <div className="grid gap-3 sm:grid-cols-2">
        {tour.addons.map((addon) => (
          <SubCard key={addon.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">{addon.name}</p>
              {addon.description && <p className="mt-0.5 text-sm text-zinc-500">{addon.description}</p>}
            </div>
            <span className="shrink-0 text-sm font-bold text-primary-600 dark:text-primary-400">+{formatMoney(addon.price)}</span>
          </SubCard>
        ))}
      </div>
    </DetailSection>
  );
}

const POLICY_FIELDS: [keyof Tour, string][] = [
  ["cancellation_policy", "Cancellation"],
  ["refund_policy", "Refunds"],
  ["rescheduling_policy", "Changing your date"],
  ["min_participant_policy", "Minimum group size"],
  ["bad_weather_policy", "Bad weather"],
  ["no_show_policy", "No-shows"],
  ["child_policy", "Children"],
  ["accessibility_policy", "Accessibility"],
  ["pet_policy", "Pets"],
  ["traveler_conduct_policy", "Traveler conduct"],
];

export function policyEntries(tour: Tour): [string, string][] {
  return POLICY_FIELDS.map(([key, label]) => [label, tour[key] as string | null | undefined]).filter(
    (entry): entry is [string, string] => !!entry[1]
  );
}

export function PoliciesSection({ tour }: { tour: Tour }) {
  const entries = policyEntries(tour);
  return (
    <DetailSection id="policies" title="Policies" icon={<FileText />}>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {entries.map(([label, text], i) => (
          <details key={label} open={i === 0} className="group py-1 first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-sm font-semibold text-zinc-900 marker:hidden dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
              {label}
              <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{text}</p>
          </details>
        ))}
      </div>
    </DetailSection>
  );
}
