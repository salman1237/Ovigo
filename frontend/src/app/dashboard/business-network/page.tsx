"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  BusinessReferral,
  OWNERSHIP_TYPE_LABELS,
  OwnershipType,
  REFERRAL_STATUS_LABELS,
} from "@/types/business-network";

export default function BusinessNetworkPage() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: referrals, isLoading, isError, error } = useQuery({
    queryKey: ["business-network", "mine"],
    queryFn: () => apiClient.get<BusinessReferral[]>("/api/v1/business-network", { auth: true }),
    retry: false,
  });

  const notEligible = isError && error instanceof ApiError && error.status === 403;
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["business-network"] });

  if (notEligible) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Business Network</h1>
        <p className="mt-4 text-sm text-zinc-500">This is for approved Local Experts only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Business Network</h1>
        <Button size="sm" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add business"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Add a local business you own or trust — approved referrals help travelers discover it through you.
      </p>

      {showForm && (
        <ReferralForm
          onCreated={() => {
            setShowForm(false);
            refetch();
          }}
        />
      )}

      {isLoading && <Spinner />}
      {!isLoading && (referrals ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No businesses yet" description="Add a local business you own or trust above." />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {(referrals ?? []).map((r) => (
          <Card key={r.id}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{r.business_name}</h3>
              <Badge>{REFERRAL_STATUS_LABELS[r.status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {r.business_type} · {OWNERSHIP_TYPE_LABELS[r.ownership_type]}
            </p>
            {r.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>}
            {r.status === "rejected" && r.rejection_reason && (
              <p className="mt-1 text-xs text-red-600">Reason: {r.rejection_reason}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReferralForm({ onCreated }: { onCreated: () => void }) {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [ownershipType, setOwnershipType] = useState<OwnershipType>("referred");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(
        "/api/v1/business-network",
        {
          business_name: businessName,
          business_type: businessType,
          ownership_type: ownershipType,
          contact_phone: contactPhone || undefined,
          contact_email: contactEmail || undefined,
          description: description || undefined,
        },
        { auth: true }
      );
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add business");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 flex flex-col gap-3">
      <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name" />
      <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Type (e.g. restaurant, shop, transport)" />
      <div className="flex gap-4">
        {(["owned", "referred"] as OwnershipType[]).map((t) => (
          <label key={t} className="flex items-center gap-1.5 text-xs">
            <input type="radio" checked={ownershipType === t} onChange={() => setOwnershipType(t)} />
            {OWNERSHIP_TYPE_LABELS[t]}
          </label>
        ))}
      </div>
      <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Contact phone (optional)" />
      <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email (optional)" />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!businessName || !businessType} className="self-start">
        Submit for review
      </Button>
    </Card>
  );
}
