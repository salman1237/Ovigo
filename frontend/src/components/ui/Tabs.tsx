"use client";

import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

/**
 * Segmented, animated tab bar for splitting a long editor page into sections.
 * Uncontrolled by default (own internal state); pass `value`/`onChange` to control it.
 */
export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (key: string) => void;
  className?: string;
}) {
  const [internal, setInternal] = useState(items[0]?.key);
  const active = value ?? internal;
  const setActive = onChange ?? setInternal;
  const activeItem = items.find((i) => i.key === active) ?? items[0];

  return (
    <div className={className}>
      <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto rounded-full border border-zinc-200 bg-zinc-100/70 p-1 dark:border-zinc-800 dark:bg-zinc-900">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActive(item.key)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              active === item.key ? "text-white" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            )}
          >
            {active === item.key && (
              <motion.div
                layoutId="tabs-active-pill"
                className="absolute inset-0 rounded-full bg-gradient-to-r from-primary-600 to-indigo-600 shadow-md shadow-primary-600/20"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {item.icon}
              {item.label}
            </span>
          </button>
        ))}
      </div>
      <motion.div
        key={active}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mt-5"
      >
        {activeItem?.content}
      </motion.div>
    </div>
  );
}
