"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { LocationPicker } from "@/components/shared/LocationPicker";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { Location } from "@/types/location";
import { DOCUMENT_TYPE_LABELS, DocumentType, PartnerRole, PartnerRoleType, ROLE_LABELS } from "@/types/partner";

const ALL_ROLE_TYPES: PartnerRoleType[] = ["local_expert", "host", "guide", "hotel", "rent_a_car"];
const ALL_DOCUMENT_TYPES: DocumentType[] = ["id_card", "trade_license", "property_deed", "vehicle_registration", "other"];

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  pending: "warning",
  approved: "success",
  verified: "success",
  rejected: "danger",
  suspended: "neutral",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "neutral"} className="capitalize">
      {status}
    </Badge>
  );
}

export default function PartnerOnboardingPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [applyRoleType, setApplyRoleType] = useState<PartnerRoleType>("local_expert");
  const [applyMessage, setApplyMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: roles, isLoading, isError } = useQuery({
    queryKey: ["my-partner-roles"],
    queryFn: () => apiClient.get<PartnerRole[]>("/api/v1/partners/roles", { auth: true }),
    enabled: !!user,
  });

  const refetchRoles = () => queryClient.invalidateQueries({ queryKey: ["my-partner-roles"] });

  const takenRoleTypes = new Set((roles ?? []).map((r) => r.role_type));

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post(
        "/api/v1/partners/roles",
        { role_type: applyRoleType, message: applyMessage || undefined },
        { auth: true }
      );
      setApplyMessage("");
      refetchRoles();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <div>
          <p className="text-zinc-600 dark:text-zinc-400">Sign in to apply as a partner.</p>
          <Link href="/account/login" className="mt-2 inline-block font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Become a Partner</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Apply as a Local Expert, Host, Guide, Hotel/Resort, or Rent-a-Car operator. Every application is
        reviewed by our team before it goes live.
      </p>

      <Card as="form" onSubmit={handleApply} className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Apply for a new role</h2>
        <Select value={applyRoleType} onChange={(e) => setApplyRoleType(e.target.value as PartnerRoleType)}>
          {ALL_ROLE_TYPES.map((rt) => (
            <option key={rt} value={rt} disabled={takenRoleTypes.has(rt)}>
              {ROLE_LABELS[rt]}
              {takenRoleTypes.has(rt) ? " (already applied)" : ""}
            </option>
          ))}
        </Select>
        <Textarea
          value={applyMessage}
          onChange={(e) => setApplyMessage(e.target.value)}
          placeholder="Tell us a bit about yourself (optional)"
          rows={3}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={submitting} className="self-start">
          {submitting ? "Submitting…" : "Submit application"}
        </Button>
      </Card>

      <h2 className="mt-10 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Your roles</h2>
      {isLoading && <Spinner />}
      {isError && <ErrorState message="Couldn't load your partner roles. Please try again." />}
      {!isLoading && !isError && (roles ?? []).length === 0 && (
        <p className="mt-2 text-sm text-zinc-400">No applications yet.</p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {(roles ?? []).map((role) => (
          <RoleCard key={role.id} role={role} onChange={refetchRoles} />
        ))}
      </div>
    </div>
  );
}

function RoleCard({ role, onChange }: { role: PartnerRole; onChange: () => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsSaved, setLocationsSaved] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("id_card");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const saveLocations = async () => {
    await apiClient.post(
      `/api/v1/partners/roles/${role.id}/locations`,
      { location_ids: locations.map((l) => l.id) },
      { auth: true }
    );
    setLocationsSaved(true);
  };

  const uploadDocument = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("document_type", documentType);
      formData.append("file", file);
      await apiClient.postForm(`/api/v1/partners/roles/${role.id}/documents`, formData, { auth: true });
      setFile(null);
      onChange();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{ROLE_LABELS[role.role_type]}</h3>
        <StatusBadge status={role.status} />
      </div>

      {role.applications[0]?.rejection_reason && (
        <p className="mt-1 text-sm text-red-600">Reason: {role.applications[0].rejection_reason}</p>
      )}

      {role.status === "pending" && (
        <>
          <div className="mt-4">
            <p className="text-xs font-medium text-zinc-500">Service locations</p>
            <LocationPicker selected={locations} onChange={setLocations} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={saveLocations}
              disabled={locations.length === 0}
              className="mt-2"
            >
              Save locations
            </Button>
            {locationsSaved && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-zinc-500">Upload a verification document</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                className="w-auto py-1.5 pr-8 text-xs"
              >
                {ALL_DOCUMENT_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {DOCUMENT_TYPE_LABELS[dt]}
                  </option>
                ))}
              </Select>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
              <Button type="button" variant="secondary" size="sm" onClick={uploadDocument} disabled={!file || uploading}>
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
            {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
          </div>
        </>
      )}

      {role.documents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">Documents</p>
          <ul className="mt-1 flex flex-col gap-1">
            {role.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between text-xs">
                <span>
                  {DOCUMENT_TYPE_LABELS[doc.document_type]} — {doc.file_name}
                </span>
                <StatusBadge status={doc.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
