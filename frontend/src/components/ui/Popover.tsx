"use client";

import { type ReactNode, useState } from "react";

import { cn } from "@/lib/cn";

export function Popover({
  trigger,
  children,
  align = "right",
  panelClassName,
}: {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute z-50 mt-2 min-w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900",
              align === "right" ? "right-0" : "left-0",
              panelClassName
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
