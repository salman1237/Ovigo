"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AlertTriangle, CheckCircle2, Upload, UserPlus } from "lucide-react";

import { LocationPicker } from "@/components/shared/LocationPicker";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { clearReferralCode, useStoredReferralCode } from "@/lib/referral";
import { useAuthStore } from "@/stores/auth-store";
import type { Location } from "@/types/location";
import {
  DOCUMENT_TYPE_LABELS,
  DocumentType,
  isExpired,
  isExpiringSoon,
  PartnerRole,
  PartnerRoleType,
  ROLE_LABELS,
} from "@/types/partner";
import { JOINABLE_ROLE_TYPES, type JoinableRoleType, type PublicReferralLink } from "@/types/referrals";

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
  return (
    <Suspense fallback={<Spinner />}>
      <PartnerOnboardingContent />
    </Suspense>
  );
}

function isJoinable(rt: PartnerRoleType): rt is JoinableRoleType {
  return (JOINABLE_ROLE_TYPES as PartnerRoleType[]).includes(rt);
}

function PartnerOnboardingContent() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const presetRole = searchParams.get("role") as PartnerRoleType | null;
  const [applyRoleType, setApplyRoleType] = useState<PartnerRoleType>(
    presetRole && ALL_ROLE_TYPES.includes(presetRole) ? presetRole : "local_expert"
  );
  const [applyMessage, setApplyMessage] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Which expert's network this application joins, if any: the code remembered from
  // /join/{code} first, else the link this account registered through (server-side,
  // survives a cleared browser).
  const storedCode = useStoredReferralCode();
  const { data: storedInvite, isError: storedInvalid } = useQuery({
    queryKey: ["referral-link", storedCode],
    queryFn: () => apiClient.get<PublicReferralLink>(`/api/v1/referrals/links/${encodeURIComponent(storedCode!)}`),
    enabled: !!storedCode,
    retry: false,
    staleTime: Infinity,
  });
  const { data: accountInvite } = useQuery({
    queryKey: ["referral-invite", user?.id],
    queryFn: () => apiClient.get<PublicReferralLink | null>("/api/v1/referrals/invite", { auth: true }),
    enabled: !!user && (!storedCode || storedInvalid),
    retry: false,
  });
  const invite = storedInvite ?? accountInvite ?? null;
  const joiningNetwork = !!invite && isJoinable(applyRoleType);

  const { data: roles, isLoading, isError } = useQuery({
    queryKey: ["my-partner-roles"],
    queryFn: () => apiClient.get<PartnerRole[]>("/api/v1/partners/roles", { auth: true }),
    enabled: !!user,
  });

  const { data: documentRequirements } = useQuery({
    queryKey: ["partner-document-requirements"],
    queryFn: () => apiClient.get<Record<string, DocumentType[]>>("/api/v1/partners/document-requirements"),
    staleTime: Infinity,
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
        {
          role_type: applyRoleType,
          message: applyMessage || undefined,
          referral_code: joiningNetwork ? invite?.code : undefined,
          accept_network_terms: joiningNetwork ? acceptTerms : undefined,
        },
        { auth: true }
      );
      setApplyMessage("");
      if (joiningNetwork) clearReferralCode();
      refetchRoles();
    } catch (err) {
      if (err instanceof ApiError && err.message.includes("no longer active")) clearReferralCode();
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

      {invite && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900 dark:border-primary-900 dark:bg-primary-950/40 dark:text-primary-100">
          <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
          <div>
            <p>
              You&apos;re joining <span className="font-semibold">{invite.expert_name}</span>&apos;s network.
            </p>
            <p className="mt-0.5 text-xs text-primary-800/80 dark:text-primary-200/80">
              Applies to Guide, Host, Hotel / Resort and Rent-a-Car applications. A Local Expert application is
              independent of any network.
            </p>
          </div>
        </div>
      )}

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
        {documentRequirements?.[applyRoleType] && documentRequirements[applyRoleType].length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              After submitting, you&apos;ll need to upload: {" "}
              <span className="font-medium">
                {documentRequirements[applyRoleType].map((dt) => DOCUMENT_TYPE_LABELS[dt]).join(", ")}
              </span>
              . Your role won&apos;t be approved until these are on file.
            </p>
          </div>
        )}
        <Textarea
          value={applyMessage}
          onChange={(e) => setApplyMessage(e.target.value)}
          placeholder="Tell us a bit about yourself (optional)"
          rows={3}
        />
        {joiningNetwork && invite && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Network terms</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                {invite.expert_name} is recorded as the Local Expert who brought you to Ovigo, and earns a referral
                commission on your completed bookings for 12 months after your approval.
              </li>
              <li>That commission is paid by Ovigo out of its own fee — your earnings are not reduced.</li>
              <li>This can&apos;t be changed to a different expert later, except by Ovigo support.</li>
            </ul>
            <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="h-4 w-4 accent-primary-600"
              />
              I accept the network terms
            </label>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" loading={submitting} disabled={joiningNetwork && !acceptTerms} className="self-start">
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
          <RoleCard
            key={role.id}
            role={role}
            onChange={refetchRoles}
            requiredDocumentTypes={documentRequirements?.[role.role_type] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function RoleCard({
  role,
  onChange,
  requiredDocumentTypes,
}: {
  role: PartnerRole;
  onChange: () => void;
  requiredDocumentTypes: DocumentType[];
}) {
  const presentDocumentTypes = new Set(role.documents.map((d) => d.document_type));
  const missingDocumentTypes = requiredDocumentTypes.filter((dt) => !presentDocumentTypes.has(dt));
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsSaved, setLocationsSaved] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>("id_card");
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState("");
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
      if (expiryDate) formData.append("expiry_date", expiryDate);
      await apiClient.postForm(`/api/v1/partners/roles/${role.id}/documents`, formData, { auth: true });
      setFile(null);
      setExpiryDate("");
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

      {role.status === "pending" && requiredDocumentTypes.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Required documents</p>
          {requiredDocumentTypes.map((dt) => (
            <div key={dt} className="flex items-center gap-1.5 text-xs">
              {presentDocumentTypes.has(dt) ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              )}
              <span className={presentDocumentTypes.has(dt) ? "text-zinc-600 dark:text-zinc-400" : "text-amber-800 dark:text-amber-300"}>
                {DOCUMENT_TYPE_LABELS[dt]}
              </span>
            </div>
          ))}
          {missingDocumentTypes.length > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              This role can&apos;t be approved until all required documents above are uploaded.
            </p>
          )}
        </div>
      )}

      {role.status === "pending" && (
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
      )}

      {(role.status === "pending" || role.status === "approved") && (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">
            {role.status === "approved" ? "Upload a renewed or new document" : "Upload a verification document"}
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className="w-auto"
            >
              {ALL_DOCUMENT_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {DOCUMENT_TYPE_LABELS[dt]}
                </option>
              ))}
            </Select>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3.5 text-sm text-zinc-600 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-primary-700 dark:hover:bg-zinc-800">
              <Upload className="h-4 w-4" />
              {file ? file.name : "Choose file"}
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            </label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              label="Expiry (optional)"
              className="w-40"
            />
            <Button type="button" variant="secondary" size="sm" onClick={uploadDocument} disabled={!file || uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
          {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
        </div>
      )}

      {role.documents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">Documents</p>
          <ul className="mt-1 flex flex-col gap-1">
            {role.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between text-xs">
                <span>
                  {DOCUMENT_TYPE_LABELS[doc.document_type]} — {doc.file_name}
                  {doc.expiry_date && <span className="text-zinc-400"> · expires {doc.expiry_date}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  {doc.status === "verified" && isExpired(doc.expiry_date) && <Badge variant="danger">Expired</Badge>}
                  {doc.status === "verified" && !isExpired(doc.expiry_date) && isExpiringSoon(doc.expiry_date) && (
                    <Badge variant="warning">Expiring soon</Badge>
                  )}
                  <StatusBadge status={doc.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
