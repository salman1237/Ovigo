"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

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

      <form
        onSubmit={createLocation}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
      >
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
          <label className="block text-xs font-medium text-zinc-500">Slug</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LocationType)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {LOCATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Parent</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">— none (top-level) —</option>
            {rows.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {"—".repeat(depth)} {node.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {submitting ? "Adding…" : "Add location"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}

      <ul className="mt-6 flex flex-col gap-1">
        {rows.map(({ node, depth }) => (
          <li
            key={node.id}
            style={{ paddingLeft: `${depth * 1.25}rem` }}
            className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            <span>
              {node.name} <span className="text-xs text-zinc-400">({node.type})</span>
            </span>
            <button
              onClick={() => deleteLocation(node.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
