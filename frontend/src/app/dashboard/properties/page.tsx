"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { PROPERTY_TYPE_LABELS, Property, PropertyType } from "@/types/stay";

const PROPERTY_TYPES: PropertyType[] = ["hotel", "resort", "homestay", "guesthouse"];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function DashboardPropertiesPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("homestay");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: properties, isLoading } = useQuery({
    queryKey: ["my-properties"],
    queryFn: () => apiClient.get<Property[]>("/api/v1/properties/mine", { auth: true }),
    enabled: !!user,
  });

  const createProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const prop = await apiClient.post<Property>(
        "/api/v1/properties",
        { name, property_type: propertyType },
        { auth: true }
      );
      queryClient.invalidateQueries({ queryKey: ["my-properties"] });
      router.push(`/dashboard/properties/${prop.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create property");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">Sign in as an approved Host to manage properties.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-zinc-900 dark:text-zinc-50">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Your Properties</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Requires an approved Host or Hotel role. Apply at{" "}
        <Link href="/account/partner" className="underline">
          Become a Partner
        </Link>{" "}
        if you haven&apos;t yet.
      </p>

      <form onSubmit={createProperty} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Type</label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value as PropertyType)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {submitting ? "Creating…" : "Create draft property"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(properties ?? []).map((prop) => (
          <Link
            key={prop.id}
            href={`/dashboard/properties/${prop.id}`}
            className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{prop.name}</p>
              <p className="text-xs text-zinc-500">{PROPERTY_TYPE_LABELS[prop.property_type]}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[prop.status]}`}>
              {prop.status.replace("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
