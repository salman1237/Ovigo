"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Compass, Languages, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ApproxPrice } from "@/components/shared/ApproxPrice";
import { BrowseHero } from "@/components/shared/BrowseHero";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { GUIDE_CERTIFICATION_LABELS, type PublicGuideSummary } from "@/types/guides";

export default function GuidesPage() {
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState("");
  const [filters, setFilters] = useState({ city: "", language: "" });

  const { data: guides, isLoading, isError } = useQuery({
    queryKey: ["guides-public", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.city) params.set("city", filters.city);
      if (filters.language) params.set("language", filters.language);
      const qs = params.toString();
      return apiClient.get<PublicGuideSummary[]>(`/api/v1/guides/public${qs ? `?${qs}` : ""}`);
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <BrowseHero title="Local Guides" subtitle="Book a verified local guide by the half day or full day." photoIndex={3} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ city: city.trim(), language: language.trim() });
        }}
        className="relative z-10 -mt-4 flex flex-col gap-2.5 rounded-2xl border border-zinc-200 bg-white p-3 shadow-elevated dark:border-zinc-800 dark:bg-zinc-900 sm:-mt-6 sm:flex-row sm:items-center"
      >
        <div className="flex-1">
          <Input placeholder="City, e.g. Bandarban" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City" />
        </div>
        <div className="flex-1">
          <Input placeholder="Language, e.g. English" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language" />
        </div>
        <Button type="submit">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      <div className="mt-8">
        {isLoading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        )}
        {isError && <ErrorState message="Couldn't load guides right now. Please try again." />}
        {!isLoading && !isError && (guides ?? []).length === 0 && (
          <EmptyState icon={Compass} title="No guides found" description="Try another city or language." />
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(guides ?? []).map((g, i) => (
            <motion.div
              key={g.guide_role_id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i, 6) * 0.05 }}
            >
              <Link href={`/guides/${g.guide_role_id}`}>
                <Card hoverable variant="elevated" className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-lg font-semibold text-white">
                      {g.full_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{g.full_name}</h3>
                      {g.headline && <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{g.headline}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    {g.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {g.city}
                      </span>
                    )}
                    {g.languages.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Languages className="h-3.5 w-3.5" /> {g.languages.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                    <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
                      From {formatMoney(g.from_price)} <ApproxPrice amountBDT={g.from_price} />
                    </p>
                    {g.certification_level !== "none" && (
                      <Badge variant="success">{GUIDE_CERTIFICATION_LABELS[g.certification_level]}</Badge>
                    )}
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
