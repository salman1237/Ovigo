"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Map } from "lucide-react";
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
import { useAuthStore } from "@/stores/auth-store";
import type { Tour } from "@/types/tour";

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  pending_review: "warning",
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
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
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
        <Link href="/account/partner" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Become a Partner
        </Link>{" "}
        if you haven&apos;t yet.
      </p>

      <Card as="form" onSubmit={createTour} className="mt-6 flex flex-wrap items-end gap-3">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input
          type="number"
          label="Duration (days)"
          min={1}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          required
          className="w-28"
        />
        <Input label="Base price (৳)" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="150.00" className="w-32" />
        <Button type="submit" loading={submitting}>
          {submitting ? "Creating…" : "Create draft tour"}
        </Button>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <Spinner />}
      {!isLoading && (tours ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState icon={Map} title="No tours yet" description="Create your first draft tour above." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(tours ?? []).map((tour) => (
          <Link key={tour.id} href={`/dashboard/tours/${tour.id}`}>
            <Card hoverable className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{tour.title}</p>
                <p className="text-xs text-zinc-500">{tour.duration_days} days · {formatMoney(tour.base_price)}</p>
              </div>
              <Badge variant={STATUS_VARIANTS[tour.status]} className="capitalize">
                {tour.status.replace("_", " ")}
              </Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
