"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Map, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { firstImageId, tourImageUrl } from "@/lib/media";
import { useAuthStore } from "@/stores/auth-store";
import type { Tour } from "@/types/tour";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  submitted_for_review: "warning",
  pending_review: "warning",
  changes_requested: "warning",
  approved: "primary",
  scheduled: "accent",
  booking_open: "success",
  almost_full: "warning",
  sold_out: "danger",
  confirmed: "success",
  in_progress: "accent",
  completed: "neutral",
  cancelled: "danger",
  suspended: "danger",
  archived: "neutral",
  published: "success",
  rejected: "danger",
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
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

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

  const handleDuplicate = async (e: React.MouseEvent, tourId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDuplicatingId(tourId);
    setError(null);
    try {
      const cloned = await apiClient.post<Tour>(`/api/v1/tours/${tourId}/duplicate`, undefined, { auth: true });
      queryClient.invalidateQueries({ queryKey: ["my-tours"] });
      router.push(`/dashboard/tours/${cloned.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to duplicate tour");
    } finally {
      setDuplicatingId(null);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">Sign in as an approved Local Expert to manage tours.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  const filteredTours = (tours ?? []).filter((tour) => {
    if (selectedFilter === "all") return true;
    if (selectedFilter === "draft") return tour.status === "draft";
    if (selectedFilter === "submitted") return tour.status === "submitted_for_review" || tour.status === "pending_review";
    if (selectedFilter === "active") return ["published", "booking_open", "almost_full", "scheduled", "confirmed"].includes(tour.status);
    if (selectedFilter === "completed") return tour.status === "completed";
    if (selectedFilter === "cancelled") return tour.status === "cancelled" || tour.status === "rejected";
    return true;
  });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">Tour Portfolio</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create, schedule departures, manage itineraries, and supervise tour operations.
          </p>
        </div>
      </div>

      <Card as="form" onSubmit={createTour} className="mt-6 flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <Input label="New Tour Title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Sreemangal Rainforest 3-Day Trek" className="flex-1 min-w-[240px]" />
        <Input
          type="number"
          label="Days"
          min={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          required
          className="w-24"
        />
        <Input label="Base Price (৳)" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="12000.00" className="w-32" />
        <Button type="submit" loading={submitting}>
          <Plus className="h-4 w-4" />
          {submitting ? "Creating…" : "Create Draft"}
        </Button>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Filter Tabs */}
      <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        {[
          { key: "all", label: "All Tours" },
          { key: "draft", label: "Drafts" },
          { key: "submitted", label: "Under Review" },
          { key: "active", label: "Active & Booking Open" },
          { key: "completed", label: "Completed" },
          { key: "cancelled", label: "Cancelled / Rejected" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSelectedFilter(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedFilter === tab.key
                ? "bg-primary-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {!isLoading && filteredTours.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={Map} title="No tours matching this filter" description="Create a new draft or select another filter tab above." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {filteredTours.map((tour) => {
          const cover = firstImageId(tour.images);
          return (
            <div key={tour.id} className="group relative">
              <Link href={`/dashboard/tours/${tour.id}`} className="block">
                <Card hoverable className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={tourImageUrl(tour.id, cover.id)}
                          alt={tour.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                          No photo
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-zinc-900 group-hover:text-primary-600 dark:text-zinc-50 dark:group-hover:text-primary-400">
                        {tour.title}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {tour.duration_days} day{tour.duration_days === 1 ? "" : "s"}
                        {tour.duration_nights ? ` / ${tour.duration_nights} nights` : ""} · {formatMoney(tour.base_price)}
                        {tour.pickup_location ? ` · Pickup: ${tour.pickup_location}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Duplicate this tour"
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      onClick={(e) => handleDuplicate(e, tour.id)}
                      loading={duplicatingId === tour.id}
                    >
                      <Copy className="h-4 w-4" />
                      <span className="hidden sm:inline">Duplicate</span>
                    </Button>
                    <Badge variant={STATUS_VARIANTS[tour.status] || "neutral"} className="capitalize">
                      {tour.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </Card>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
