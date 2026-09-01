"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import type { Tour } from "@/types/tour";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function DashboardToursPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(1);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: tours, isLoading } = useQuery({
    queryKey: ["my-tours"],
    queryFn: () => apiClient.get<Tour[]>("/api/v1/tours/mine", { auth: true }),
    enabled: !!user,
  });

  const createTour = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tour = await apiClient.post<Tour>(
        "/api/v1/tours",
        { title, duration_days: duration, base_price: price },
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["my-tours"] });
      router.push(`/dashboard/tours/${tour.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create tour");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">Sign in as an approved Local Expert to manage tours.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-zinc-900 dark:text-zinc-50">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your Tours</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Requires an approved Local Expert role. Apply at{" "}
        <Link href="/account/partner" className="underline">
          Become a Partner
        </Link>{" "}
        if you haven&apos;t yet.
      </p>

      <form onSubmit={createTour} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Duration (days)</label>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            required
            className="mt-1 w-24 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Base price (৳)</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            placeholder="150.00"
            className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {submitting ? "Creating…" : "Create draft tour"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(tours ?? []).map((tour) => (
          <Link
            key={tour.id}
            href={`/dashboard/tours/${tour.id}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{tour.title}</p>
              <p className="text-xs text-zinc-500">{tour.duration_days} days · {formatMoney(tour.base_price)}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tour.status]}`}>
              {tour.status.replace("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
