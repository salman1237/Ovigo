"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Driver } from "@/types/rentcar";

export default function DashboardDriversPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: drivers, isLoading, isError, error: fetchError } = useQuery({
    queryKey: ["drivers", "mine"],
    queryFn: () => apiClient.get<Driver[]>("/api/v1/drivers/mine", { auth: true }),
    enabled: !!user,
    retry: false,
  });

  const notEligible = isError && fetchError instanceof ApiError && fetchError.status === 403;
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["drivers"] });

  const createDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post("/api/v1/drivers", { full_name: fullName, license_number: licenseNumber, phone: phone || undefined }, { auth: true });
      setFullName("");
      setLicenseNumber("");
      setPhone("");
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add driver");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAvailable = async (driver: Driver) => {
    await apiClient.put(`/api/v1/drivers/${driver.id}?is_available=${!driver.is_available}`, undefined, { auth: true });
    refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/drivers/${id}`, { auth: true });
    refetch();
  };

  if (notEligible) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Drivers</h1>
        <p className="mt-4 text-sm text-zinc-500">This is for approved Rent-a-Car partners only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">My Drivers</h1>
      <p className="mt-1 text-sm text-zinc-500">Maintain your driver roster — assign one to a vehicle from its edit page.</p>

      <form onSubmit={createDriver} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">License number</label>
          <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Phone (optional)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        </div>
        <button type="submit" disabled={submitting} className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900">
          {submitting ? "Adding…" : "Add driver"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}

      <div className="mt-6 flex flex-col gap-3">
        {(drivers ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{d.full_name}</p>
              <p className="text-xs text-zinc-500">{d.license_number}{d.phone && ` · ${d.phone}`}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs ${d.is_available ? "text-emerald-600" : "text-zinc-400"}`}>
                {d.is_available ? "Available" : "Unavailable"}
              </span>
              <button onClick={() => toggleAvailable(d)} className="text-xs text-zinc-500 underline">
                Toggle
              </button>
              <button onClick={() => remove(d.id)} className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
        {!isLoading && (drivers ?? []).length === 0 && <p className="text-sm text-zinc-400">No drivers added yet.</p>}
      </div>
    </div>
  );
}
