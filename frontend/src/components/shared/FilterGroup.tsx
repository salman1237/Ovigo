"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

/** A single collapsible filter box — the pattern sharetrip.net's own hotel-search
 * sidebar uses (Price per Night / Star Category / Meal Plans / ... each as its own
 * boxed dropdown) rather than one long flat form. */
export function FilterGroup({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">{children}</div>}
    </div>
  );
}
