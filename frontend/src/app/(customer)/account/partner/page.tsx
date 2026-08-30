"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { LocationPicker } from "@/components/shared/LocationPicker";
import { apiClient, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { Location } from "@/types/location";
import { DOCUMENT_TYPE_LABELS, DocumentType, PartnerRole, PartnerRoleType, ROLE_LABELS } from "@/types/partner";

const ALL_ROLE_TYPES: PartnerRoleType[] = ["local_expert", "host", "guide", "hotel", "rent_a_car"];
const ALL_DOCUMENT_TYPES: DocumentType[] = ["id_card", "trade_license", "property_deed", "vehicle_registration", "other"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  verified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  suspended: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default function PartnerOnboardingPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [applyRoleType, setApplyRoleType] = useState<PartnerRoleType>("local_expert");
  const [applyMessage, setApplyMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: roles, isLoading } = useQuery({
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
          <Link href="/account/login" className="mt-2 inline-block font-medium text-zinc-900 dark:text-zinc-50">
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

      <form onSubmit={handleApply} className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Apply for a new role</h2>
        <select
          value={applyRoleType}
          onChange={(e) => setApplyRoleType(e.target.value as PartnerRoleType)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {ALL_ROLE_TYPES.map((rt) => (
            <option key={rt} value={rt} disabled={takenRoleTypes.has(rt)}>
              {ROLE_LABELS[rt]}
              {takenRoleTypes.has(rt) ? " (already applied)" : ""}
            </option>
          ))}
        </select>
        <textarea
          value={applyMessage}
          onChange={(e) => setApplyMessage(e.target.value)}
          placeholder="Tell us a bit about yourself (optional)"
          rows={3}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </form>

      <h2 className="mt-10 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Your roles</h2>
      {isLoading && <p className="mt-2 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (roles ?? []).length === 0 && (
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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
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
            <button
              type="button"
              onClick={saveLocations}
              disabled={locations.length === 0}
              className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
            >
              Save locations
            </button>
            {locationsSaved && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium text-zinc-500">Upload a verification document</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              >
                {ALL_DOCUMENT_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {DOCUMENT_TYPE_LABELS[dt]}
                  </option>
                ))}
              </select>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-xs"
              />
              <button
                type="button"
                onClick={uploadDocument}
                disabled={!file || uploading}
                className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
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
    </div>
  );
}
