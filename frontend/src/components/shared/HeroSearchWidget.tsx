"use client";

import { Building2, Car, Map, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DestinationSearchInput } from "@/components/shared/DestinationSearchInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import type { Location } from "@/types/location";

type Tab = "tours" | "stays" | "rent-a-car";

const TABS: { id: Tab; label: string; icon: typeof Map }[] = [
  { id: "tours", label: "Tours", icon: Map },
  { id: "stays", label: "Stays", icon: Building2 },
  { id: "rent-a-car", label: "Rent a Car", icon: Car },
];

export function HeroSearchWidget() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tours");
  const [destination, setDestination] = useState<Location | null>(null);
  const [destinationText, setDestinationText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);

  const search = () => {
    const qs = new URLSearchParams();
    if (destination) qs.set("location_slug", destination.slug);

    if (tab === "tours") {
      if (keyword.trim()) qs.set("q", keyword.trim());
      router.push(`/tours${qs.toString() ? `?${qs}` : ""}`);
    } else if (tab === "stays") {
      if (checkIn) qs.set("check_in", checkIn);
      if (checkOut) qs.set("check_out", checkOut);
      qs.set("guests", String(guests));
      router.push(`/stays${qs.toString() ? `?${qs}` : ""}`);
    } else {
      router.push(`/rent-a-car${qs.toString() ? `?${qs}` : ""}`);
    }
  };

  return (
    <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-elevated backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:p-4">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-3.5",
              tab === t.id
                ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                : "text-zinc-500 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <DestinationSearchInput
          value={destinationText}
          onSelect={(loc) => {
            setDestination(loc);
            setDestinationText(loc.name);
          }}
          placeholder={tab === "stays" ? "Which city or area?" : "Where to?"}
        />

        {tab === "tours" && (
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Keyword (optional)"
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-primary-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 sm:w-48"
          />
        )}

        {tab === "stays" && (
          <>
            <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="sm:w-40" />
            <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="sm:w-40" />
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900 sm:w-28">
              <Users className="h-4 w-4 shrink-0 text-zinc-400" />
              <input
                type="number"
                min={1}
                value={guests}
                onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
                className="w-full bg-transparent text-sm text-zinc-900 outline-none dark:text-zinc-50"
              />
            </div>
          </>
        )}

        <Button onClick={search} size="lg" className="sm:w-auto">
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>
    </div>
  );
}
