"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Globe, Search, Smartphone } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient, ApiError } from "@/lib/api-client";
import type { EsimCountry } from "@/types/esim";

export default function EsimCountriesPage() {
  const [search, setSearch] = useState("");

  const { data: countries, isLoading, isError, error } = useQuery({
    queryKey: ["esim", "countries"],
    queryFn: () => apiClient.get<EsimCountry[]>("/api/v1/esim/countries"),
    retry: false,
  });

  const unavailable = error instanceof ApiError && error.status === 503;

  const filtered = useMemo(() => {
    const list = countries ?? [];
    const term = search.trim().toLowerCase();
    const matches = term
      ? list.filter((c) => c.name_en.toLowerCase().includes(term) || c.iso2.toLowerCase().includes(term))
      : list;
    return [...matches].sort((a, b) => Number(b.is_popular) - Number(a.is_popular) || a.name_en.localeCompare(b.name_en));
  }, [countries, search]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-md shadow-primary-600/20">
          <Smartphone className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Stay connected abroad</h1>
          <p className="text-sm text-zinc-500">Instant eSIM data plans in 190+ countries — no roaming surprises.</p>
        </div>
      </div>

      {!unavailable && (
        <div className="mt-6 max-w-sm">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a country…"
            aria-label="Search countries"
          />
        </div>
      )}

      {isLoading && (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      )}

      {unavailable && (
        <div className="mt-10">
          <EmptyState
            icon={Globe}
            title="eSIM plans coming soon"
            description="This feature isn't available yet — check back shortly."
          />
        </div>
      )}

      {isError && !unavailable && (
        <div className="mt-10">
          <ErrorState message="Couldn't load eSIM destinations right now. Please try again." />
        </div>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className="mt-10">
          <EmptyState icon={Search} title="No countries match your search" />
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((country, i) => (
          <motion.div
            key={country.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i, 10) * 0.03 }}
          >
            <Link
              href={`/esim/${country.iso2.toLowerCase()}`}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-600/10 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-primary-800"
            >
              {country.flag_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={country.flag_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                  <Globe className="h-4 w-4" />
                </span>
              )}
              <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">{country.name_en}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
