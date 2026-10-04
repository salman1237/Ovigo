/** Presentational building blocks for long detail pages (tour, expert profile):
 * an anchored section, tinted icon badges, pills, label/value lists, callouts. */
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "accent";

const TONE_PILL: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  primary: "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200/70 dark:bg-primary-950/50 dark:text-primary-300 dark:ring-primary-900",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  danger: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200/70 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  accent: "bg-accent-500 text-white",
};

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  primary: "bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400",
  success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400",
  danger: "bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400",
  accent: "bg-accent-500 text-white",
};

/** A page section: anchor target for the section nav, with a heading and a card body. */
export function DetailSection({
  id,
  title,
  subtitle,
  icon,
  action,
  children,
  bare = false,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Children draw their own cards (e.g. a grid of stays). */
  bare?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon && <IconBadge tone="primary">{icon}</IconBadge>}
          <div>
            <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {bare ? (
        children
      ) : (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {children}
        </div>
      )}
    </section>
  );
}

export function IconBadge({ tone = "primary", size = "md", children }: { tone?: Tone; size?: "sm" | "md"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl",
        size === "md" ? "h-10 w-10 [&>svg]:h-5 [&>svg]:w-5" : "h-8 w-8 rounded-xl [&>svg]:h-4 [&>svg]:w-4",
        TONE_ICON[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Pill({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium [&>svg]:h-3.5 [&>svg]:w-3.5",
        TONE_PILL[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** A label/value list that silently drops empty values. */
export function DetailList({ items, columns = 2 }: { items: [string, ReactNode][]; columns?: 1 | 2 }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== "" && value !== false);
  if (shown.length === 0) return null;
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 text-sm", columns === 2 && "sm:grid-cols-2")}>
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</dt>
          <dd className="mt-0.5 text-zinc-800 dark:text-zinc-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = "neutral", icon, title, children }: { tone?: Tone; icon?: ReactNode; title?: string; children: ReactNode }) {
  const surface: Record<Tone, string> = {
    neutral: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60",
    primary: "border-primary-200 bg-primary-50/70 dark:border-primary-900 dark:bg-primary-950/30",
    success: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
    warning: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
    danger: "border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30",
    accent: "border-accent-200 bg-accent-50 dark:border-accent-900 dark:bg-accent-950/30",
  };
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-3.5 text-sm", surface[tone])}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <div className="min-w-0 text-zinc-700 dark:text-zinc-300">
        {title && <p className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** A card inside a section (a stay, an activity, a vehicle…). */
export function SubCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900", className)}>
      {children}
    </div>
  );
}
