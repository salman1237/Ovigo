"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { PROPERTY_TYPE_LABELS, Property, PropertyType } from "@/types/stay";

const PROPERTY_TYPES: PropertyType[] = ["hotel", "resort", "homestay", "guesthouse"];

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  rejected: "danger",
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
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
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
        <Link href="/account/partner" className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Become a Partner
        </Link>{" "}
        if you haven&apos;t yet.
      </p>

      <Card as="form" onSubmit={createProperty} className="mt-6 flex flex-wrap items-end gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select label="Type" value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType)} className="w-auto">
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
          ))}
        </Select>
        <Button type="submit" loading={submitting}>
          {submitting ? "Creating…" : "Create draft property"}
        </Button>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <Spinner />}
      {!isLoading && (properties ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState icon={Building2} title="No properties yet" description="Create your first draft property above." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(properties ?? []).map((prop) => (
          <Link key={prop.id} href={`/dashboard/properties/${prop.id}`}>
            <Card hoverable className="flex items-center justify-between">
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{prop.name}</p>
                <p className="text-xs text-zinc-500">{PROPERTY_TYPE_LABELS[prop.property_type]}</p>
              </div>
              <Badge variant={STATUS_VARIANTS[prop.status]} className="capitalize">
                {prop.status.replace("_", " ")}
              </Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
