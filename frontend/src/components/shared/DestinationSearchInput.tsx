"use client";

import { MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";
import type { Location } from "@/types/location";

/** Single-destination autocomplete for the homepage hero search widget — distinct
 * from LocationPicker (a multi-select tag picker used when tagging a listing with
 * several locations). Debounced against GET /api/v1/locations/search. */
export function DestinationSearchInput({
  value,
  onSelect,
  placeholder = "Where do you want to go?",
}: {
  value: string;
  onSelect: (location: Location) => void;
  placeholder?: string;
}) {
  // Uncontrolled after mount — `value` only seeds the initial text; this
  // component doesn't need to track later external resets in practice (see
  // HeroSearchWidget, its only caller), so no prop-sync effect is needed.
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Every setState below runs inside the timeout callback (an async
    // boundary), never synchronously in the effect body itself — satisfies
    // react-hooks/set-state-in-effect while still debouncing the lookup.
    const handle = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      try {
        const found = await apiClient.get<Location[]>(`/api/v1/locations/search?q=${encodeURIComponent(query)}`);
        setResults(found);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 focus-within:border-primary-400 dark:border-zinc-700 dark:bg-zinc-900">
        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute top-full z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-elevated dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(loc);
                  setQuery(loc.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-primary-50 dark:hover:bg-zinc-800"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="text-zinc-900 dark:text-zinc-50">{loc.name}</span>
                <span className="text-xs capitalize text-zinc-400">{loc.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
