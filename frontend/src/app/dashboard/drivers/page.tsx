"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
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

      <Card as="form" onSubmit={createDriver} className="mt-6 flex flex-wrap items-end gap-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input label="License number" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required />
        <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit" loading={submitting}>
          {submitting ? "Adding…" : "Add driver"}
        </Button>
      </Card>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {isLoading && <Spinner />}

      <div className="mt-6 flex flex-col gap-3">
        {(drivers ?? []).map((d) => (
          <Card key={d.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{d.full_name}</p>
              <p className="text-xs text-zinc-500">{d.license_number}{d.phone && ` · ${d.phone}`}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium ${d.is_available ? "text-emerald-600" : "text-zinc-400"}`}>
                {d.is_available ? "Available" : "Unavailable"}
              </span>
              <button onClick={() => toggleAvailable(d)} className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
                Toggle
              </button>
              <button onClick={() => remove(d.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                Remove
              </button>
            </div>
          </Card>
        ))}
        {!isLoading && (drivers ?? []).length === 0 && (
          <EmptyState icon={Users} title="No drivers added yet" description="Add a driver above to assign them to a vehicle." />
        )}
      </div>
    </div>
  );
}
