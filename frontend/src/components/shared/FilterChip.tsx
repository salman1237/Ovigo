"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

/** A tappable selectable card for filter options — replaces plain checkbox
 * rows, matching how every real OTA (ShareTrip included) renders its filter
 * lists as chips rather than a form. */
export function FilterChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
        selected
          ? "border-primary-600 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-950/50 dark:text-primary-300"
          : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
