"use client";

import { useState } from "react";

import { apiClient } from "@/lib/api-client";
import type { Location } from "@/types/location";

interface LocationPickerProps {
  selected: Location[];
  onChange: (locations: Location[]) => void;
}

export function LocationPicker({ selected, onChange }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await apiClient.get<Location[]>(`/api/v1/locations/search?q=${encodeURIComponent(q)}`);
      setResults(found.filter((loc) => !selected.some((s) => s.id === loc.id)));
    } finally {
      setSearching(false);
    }
  };

  const addLocation = (loc: Location) => {
    onChange([...selected, loc]);
    setResults((r) => r.filter((l) => l.id !== loc.id));
    setQuery("");
  };

  const removeLocation = (id: string) => {
    onChange(selected.filter((l) => l.id !== id));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {selected.map((loc) => (
          <span
            key={loc.id}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
          >
            {loc.name}
            <button
              type="button"
              onClick={() => removeLocation(loc.id)}
              className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-300"
              aria-label={`Remove ${loc.name}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Search destinations (e.g. Dhaka, Cox's Bazar)…"
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />

      {searching && <p className="mt-1 text-xs text-zinc-400">Searching…</p>}

      {results.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700">
          {results.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                onClick={() => addLocation(loc)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {loc.name} <span className="text-xs text-zinc-400">({loc.type})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
