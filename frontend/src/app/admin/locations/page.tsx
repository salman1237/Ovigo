"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import type { Location, LocationNode, LocationType } from "@/types/location";

const LOCATION_TYPES: LocationType[] = ["country", "region", "city", "attraction"];

function flatten(nodes: LocationNode[], depth = 0): { node: LocationNode; depth: number }[] {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

export default function AdminLocationsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<LocationType>("country");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: tree, isLoading } = useQuery({
    queryKey: ["locations-hierarchy"],
    queryFn: () => apiClient.get<LocationNode[]>("/api/v1/locations/hierarchy"),
  });

  const rows = flatten(tree ?? []);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["locations-hierarchy"] });

  const createLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post<Location>(
        "/api/v1/locations",
        { name, slug, type, parent_id: parentId || undefined },
        { auth: true }
      );
      setName("");
      setSlug("");
      setParentId("");
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create location");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteLocation = async (id: string) => {
    try {
      await apiClient.delete(`/api/v1/locations/${id}`, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete — it may have child locations");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Locations</h1>
      <p className="mt-1 text-sm text-zinc-500">Country → Region → City → Attraction hierarchy.</p>

      <Card as="form" onSubmit={createLocation} className="mt-6 flex flex-wrap items-end gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as LocationType)} className="w-auto">
          {LOCATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select label="Parent" value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-auto">
          <option value="">— none (top-level) —</option>
          {rows.map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {"—".repeat(depth)} {node.name}
            </option>
          ))}
        </Select>
        <Button type="submit" loading={submitting}>
          {submitting ? "Adding…" : "Add location"}
        </Button>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <Spinner />}

      <ul className="mt-6 flex flex-col gap-1">
        {rows.map(({ node, depth }) => (
          <li
            key={node.id}
            style={{ paddingLeft: `${depth * 1.25}rem` }}
            className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm hover:bg-primary-50/60 dark:hover:bg-primary-950/20"
          >
            <span>
              {node.name} <span className="text-xs text-zinc-400">({node.type})</span>
            </span>
            <button onClick={() => deleteLocation(node.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
