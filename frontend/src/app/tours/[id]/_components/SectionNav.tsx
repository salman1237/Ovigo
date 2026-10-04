"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

export interface NavItem {
  id: string;
  label: string;
}

/** Sticky in-page navigation with scroll-spy: highlights the section in view and
 * scrolls smoothly to a section on click. Only lists sections that rendered. */
export function SectionNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 }
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="Tour sections" className="sticky top-16 z-30 -mx-4 border-b border-zinc-200/80 bg-white/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/90">
      <ul className="scrollbar-none flex gap-1 overflow-x-auto py-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                setActive(item.id);
              }}
              className={cn(
                "block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active === item.id
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
