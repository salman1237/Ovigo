"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Network, Plus, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import {
  BUSINESS_TYPE_LABELS,
  BusinessReferral,
  BusinessType,
  OWNERSHIP_TYPE_DESCRIPTIONS,
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
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">Business Network</h1>
        <p className="mt-4 text-sm text-zinc-500">This is for approved Local Experts only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-zinc-900 sm:text-3xl dark:text-zinc-50">Business Network</h1>
        <Button size="sm" variant={showForm ? "secondary" : "primary"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? (
            <>
              <X className="h-3.5 w-3.5" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              Add business
            </>
          )}
        </Button>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        Add a local business you own or trust — approved referrals help travelers discover it through you.
      </p>

      {showForm && (
        <div className="mt-6">
          <ReferralForm
            onCreated={() => {
              setShowForm(false);
              refetch();
            }}
          />
        </div>
      )}

      <div className="mt-8">
        <Card variant="elevated">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="text-primary-600 dark:text-primary-400">
              <Network className="h-4 w-4" />
            </span>
            Your businesses
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            {isLoading && <Spinner />}
            {!isLoading && (referrals ?? []).length === 0 && (
              <EmptyState title="No businesses yet" description="Add a local business you own or trust above." />
            )}
            {(referrals ?? []).map((r) => (
              <ReferralCard key={r.id} referral={r} onChange={refetch} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ReferralCard({ referral: r, onChange }: { referral: BusinessReferral; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const sendInvite = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(`/api/v1/business-network/${r.id}/send-invite`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invite");
    } finally {
      setBusy(false);
    }
  };

  const claimUrl = r.invite_token ? `${window.location.origin}/business-network/claim/${r.invite_token}` : null;
  const typeLabel = BUSINESS_TYPE_LABELS[r.business_type] ?? r.business_type;
  const displayType = r.business_type === "other" && r.business_type_note
    ? `Other — ${r.business_type_note}`
    : typeLabel;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-3.5 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{r.business_name}</h3>
        <div className="flex items-center gap-1.5">
          {r.is_business_verified && <Badge variant="success">Verified</Badge>}
          <Badge>{REFERRAL_STATUS_LABELS[r.status]}</Badge>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {displayType} · {OWNERSHIP_TYPE_LABELS[r.ownership_type]}
      </p>
      {r.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>}
      {r.status === "rejected" && r.rejection_reason && (
        <p className="mt-1 text-xs text-red-600">Reason: {r.rejection_reason}</p>
      )}
      {r.ownership_type === "unverified_recommendation" && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Unverified recommendations cannot earn commission. Contact support to convert to Referred.
        </p>
      )}

      {r.ownership_type === "referred" && r.status === "approved" && (
        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
          {r.invite_token ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-zinc-500">
                {r.invite_accepted_at ? "Owner has claimed this invite." : "Share this link with the business owner:"}
              </p>
              {!r.invite_accepted_at && claimUrl && (
                <div className="flex gap-2">
                  <code className="flex-1 truncate rounded-lg bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{claimUrl}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(claimUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={sendInvite} loading={busy}>
              Invite the owner
            </Button>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

const ALL_OWNERSHIP_TYPES: OwnershipType[] = [
  "owned",
  "managed",
  "referred",
  "partner",
  "unverified_recommendation",
];

function ReferralForm({ onCreated }: { onCreated: () => void }) {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [businessTypeNote, setBusinessTypeNote] = useState("");
  const [ownershipType, setOwnershipType] = useState<OwnershipType>("referred");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!businessType) return;
    setError(null);
    setBusy(true);
    try {
      await apiClient.post(
        "/api/v1/business-network",
        {
          business_name: businessName,
          business_type: businessType,
          business_type_note: businessTypeNote || undefined,
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

  const isValid = !!businessName && !!businessType && (businessType !== "other" || !!businessTypeNote);

  return (
    <Card variant="elevated" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Add a business</h2>

      <Input
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        placeholder="Business name"
      />

      <Select
        label="Business type"
        value={businessType}
        onChange={(e) => setBusinessType(e.target.value as BusinessType | "")}
      >
        <option value="" disabled>Select a type...</option>
        {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((t) => (
          <option key={t} value={t}>{BUSINESS_TYPE_LABELS[t]}</option>
        ))}
      </Select>

      {businessType === "other" && (
        <Input
          value={businessTypeNote}
          onChange={(e) => setBusinessTypeNote(e.target.value)}
          placeholder="Describe the business type (required)"
        />
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Your relationship to this business</p>
        {ALL_OWNERSHIP_TYPES.map((t) => (
          <label key={t} className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 transition-colors has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50/50 dark:border-zinc-700 dark:has-[:checked]:border-primary-500 dark:has-[:checked]:bg-primary-950/20">
            <input
              type="radio"
              name="ownership_type"
              checked={ownershipType === t}
              onChange={() => setOwnershipType(t)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary-600"
            />
            <div>
              <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{OWNERSHIP_TYPE_LABELS[t]}</p>
              <p className="text-xs text-zinc-500">{OWNERSHIP_TYPE_DESCRIPTIONS[t]}</p>
            </div>
          </label>
        ))}
      </div>

      <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Contact phone (optional)" />
      <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email (optional)" />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button onClick={submit} loading={busy} disabled={!isValid} className="self-start">
        Submit for review
      </Button>
    </Card>
  );
}
