"use client";

import { useState } from "react";

import { AlertTriangle, ArrowLeft, ArrowRight, Check, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type PartnerRole,
  type PartnerRoleType,
  ROLE_LABELS,
} from "@/types/partner";

type FieldKind = "text" | "textarea" | "tel" | "number" | "select" | "checkbox" | "tags";

interface FieldOption {
  value: string;
  label: string;
}

interface FieldConfig {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: FieldOption[];
  placeholder?: string;
  hint?: string;
}

type FieldValue = string | number | boolean | string[] | undefined;
type FormState = Record<string, FieldValue>;

const COMMON_FIELDS: FieldConfig[] = [
  { key: "full_legal_name", label: "Full legal name", kind: "text", required: true },
  { key: "contact_mobile_number", label: "Mobile number", kind: "tel", required: true },
  {
    key: "national_id_type",
    label: "National ID type",
    kind: "select",
    required: true,
    options: [
      { value: "id_card", label: "ID Card" },
      { value: "passport", label: "Passport" },
    ],
  },
  { key: "national_id_number", label: "National ID number", kind: "text", required: true },
  { key: "permanent_address", label: "Permanent address", kind: "textarea", required: true },
  { key: "current_address", label: "Current address", kind: "textarea", required: true },
  { key: "emergency_contact_name", label: "Emergency contact name", kind: "text", required: true },
  { key: "emergency_contact_phone", label: "Emergency contact phone", kind: "tel", required: true },
  {
    key: "payout_method",
    label: "Payout method",
    kind: "select",
    required: true,
    options: [
      { value: "bank", label: "Bank" },
      { value: "mobile_financial_service", label: "Mobile Financial Service" },
    ],
  },
  { key: "payout_provider_name", label: "Bank / MFS provider name", kind: "text", required: true },
  { key: "payout_account_name", label: "Account holder name", kind: "text", required: true },
  { key: "payout_account_number", label: "Account number", kind: "text", required: true },
  { key: "tax_id", label: "Tax ID (if applicable)", kind: "text", required: false },
  {
    key: "agreed_to_partner_terms",
    label: "I agree to Ovigo's partner terms & conditions",
    kind: "checkbox",
    required: true,
  },
  {
    key: "agreed_to_background_check",
    label: "I consent to a background check",
    kind: "checkbox",
    required: true,
  },
];

const ROLE_DETAIL_FIELDS: Record<PartnerRoleType, FieldConfig[]> = {
  local_expert: [
    { key: "primary_destination", label: "Primary destination", kind: "text", required: true },
    {
      key: "secondary_destinations",
      label: "Other destinations covered",
      kind: "tags",
      required: false,
      hint: "Press Enter or comma to add",
    },
    { key: "years_experience", label: "Years of experience", kind: "number", required: true },
    { key: "languages", label: "Languages spoken", kind: "tags", required: true, hint: "Press Enter or comma to add" },
    { key: "training_background", label: "Training background", kind: "textarea", required: true },
    { key: "local_references", label: "Local references", kind: "textarea", required: true },
    {
      key: "expertise_categories",
      label: "Expertise categories",
      kind: "tags",
      required: true,
      hint: "e.g. trekking, cultural tours — press Enter or comma to add",
    },
    {
      key: "emergency_handling_capability",
      label: "I can handle on-ground emergencies",
      kind: "checkbox",
      required: true,
    },
  ],
  guide: [
    { key: "languages", label: "Languages spoken", kind: "tags", required: true, hint: "Press Enter or comma to add" },
    { key: "service_locations", label: "Service locations", kind: "text", required: true },
    { key: "expertise", label: "Areas of expertise", kind: "tags", required: true, hint: "Press Enter or comma to add" },
    { key: "years_experience", label: "Years of experience", kind: "number", required: true },
    {
      key: "supervising_expert_referral_code",
      label: "Supervising expert referral code (optional)",
      kind: "text",
      required: false,
    },
  ],
  host: [
    {
      key: "ownership_type",
      label: "Ownership type",
      kind: "select",
      required: true,
      options: [
        { value: "owner", label: "Owner" },
        { value: "lease", label: "Lease" },
        { value: "management", label: "Management" },
      ],
    },
    { key: "property_address", label: "Property address", kind: "textarea", required: true },
    { key: "fire_safety_info", label: "Fire & safety information", kind: "textarea", required: true },
    {
      key: "cancellation_policy_agreement",
      label: "I agree to Ovigo's cancellation policy",
      kind: "checkbox",
      required: true,
    },
    {
      key: "guest_registration_compliance",
      label: "I will comply with guest registration requirements",
      kind: "checkbox",
      required: true,
    },
  ],
  hotel: [],
  rent_a_car: [
    { key: "service_area", label: "Service area", kind: "text", required: true },
    { key: "emergency_support_number", label: "Emergency support number", kind: "tel", required: true },
  ],
};
ROLE_DETAIL_FIELDS.hotel = ROLE_DETAIL_FIELDS.host;

function isFilled(field: FieldConfig, value: FieldValue): boolean {
  if (!field.required) return true;
  switch (field.kind) {
    case "checkbox":
      return value === true;
    case "tags":
      return Array.isArray(value) && value.length > 0;
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    default:
      return typeof value === "string" && value.trim().length > 0;
  }
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-2 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 dark:border-zinc-700 dark:bg-zinc-900">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300"
        >
          {tag}
          <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          if (e.target.value.endsWith(",")) {
            const tag = e.target.value.slice(0, -1).trim();
            if (tag && !value.includes(tag)) onChange([...value, tag]);
            setDraft("");
          } else {
            setDraft(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-[8rem] flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
      />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  if (field.kind === "checkbox") {
    return (
      <label className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
        />
        <span>
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </span>
      </label>
    );
  }

  const label = (
    <>
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </>
  );

  if (field.kind === "select") {
    return (
      <Select
        label={label as unknown as string}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select…
        </option>
        {field.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    );
  }

  if (field.kind === "textarea") {
    return (
      <Textarea
        label={label as unknown as string}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={field.placeholder}
      />
    );
  }

  if (field.kind === "tags") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <TagInput value={(value as string[]) ?? []} onChange={onChange} placeholder={field.hint ?? "Type and press Enter"} />
      </div>
    );
  }

  return (
    <Input
      label={label as unknown as string}
      type={field.kind === "number" ? "number" : field.kind === "tel" ? "tel" : "text"}
      value={value === undefined ? "" : (value as string | number)}
      onChange={(e) => onChange(field.kind === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)}
      placeholder={field.placeholder}
      hint={field.hint}
    />
  );
}

interface WizardProps {
  roleType: PartnerRoleType;
  requiredDocumentTypes: DocumentType[];
  optionalDocumentTypes: DocumentType[];
  extraPayload?: Record<string, unknown>;
  extraSubmitDisabled?: boolean;
  onSubmitted: (role: PartnerRole) => void;
  onError?: (err: unknown) => void;
}

const STEP_LABELS = ["Your details", "Role details", "Documents", "Review & submit"];

export function PartnerApplicationWizard({
  roleType,
  requiredDocumentTypes,
  optionalDocumentTypes,
  extraPayload,
  extraSubmitDisabled,
  onSubmitted,
  onError,
}: WizardProps) {
  const [step, setStep] = useState(0);
  const [common, setCommon] = useState<FormState>({});
  const [details, setDetails] = useState<FormState>({});
  const [documents, setDocuments] = useState<Partial<Record<DocumentType, File>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailFields = ROLE_DETAIL_FIELDS[roleType];
  const allDocumentTypes = [...requiredDocumentTypes, ...optionalDocumentTypes];

  const commonValid = COMMON_FIELDS.every((f) => isFilled(f, common[f.key]));
  const detailsValid = detailFields.every((f) => isFilled(f, details[f.key]));
  const documentsValid = requiredDocumentTypes.every((dt) => !!documents[dt]);
  const allValid = commonValid && detailsValid && documentsValid && !extraSubmitDisabled;

  const stepValid = [commonValid, detailsValid, documentsValid, allValid][step];

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const role = await apiClient.post<PartnerRole>(
        "/api/v1/partners/roles",
        {
          role_type: roleType,
          ...common,
          role_details: details,
          ...extraPayload,
        },
        { auth: true }
      );
      for (const [documentType, file] of Object.entries(documents)) {
        if (!file) continue;
        const formData = new FormData();
        formData.append("document_type", documentType);
        formData.append("file", file);
        await apiClient.postForm(`/api/v1/partners/roles/${role.id}/documents`, formData, { auth: true });
      }
      onSubmitted(role);
    } catch (err) {
      onError?.(err);
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < step
                  ? "bg-primary-600 text-white"
                  : i === step
                    ? "bg-primary-100 text-primary-700 ring-2 ring-primary-600 dark:bg-primary-950 dark:text-primary-300"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("hidden text-xs sm:inline", i === step ? "font-medium text-zinc-900 dark:text-zinc-50" : "text-zinc-400")}>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {COMMON_FIELDS.map((f) => (
            <div key={f.key} className={cn(f.kind === "textarea" || f.kind === "checkbox" ? "sm:col-span-2" : undefined)}>
              <FieldInput field={f} value={common[f.key]} onChange={(v) => setCommon((s) => ({ ...s, [f.key]: v }))} />
            </div>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="text-sm text-zinc-500 sm:col-span-2">
            {ROLE_LABELS[roleType]}-specific information, required for PRD §7 verification.
          </p>
          {detailFields.map((f) => (
            <div key={f.key} className={cn(f.kind === "textarea" || f.kind === "checkbox" || f.kind === "tags" ? "sm:col-span-2" : undefined)}>
              <FieldInput field={f} value={details[f.key]} onChange={(v) => setDetails((s) => ({ ...s, [f.key]: v }))} />
            </div>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">
            Required documents must be attached before you can submit. Optional documents strengthen your application
            but aren&apos;t required.
          </p>
          {allDocumentTypes.map((dt) => {
            const required = requiredDocumentTypes.includes(dt);
            const file = documents[dt];
            return (
              <div
                key={dt}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2 text-sm">
                  {file ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : required ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  ) : null}
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{DOCUMENT_TYPE_LABELS[dt]}</span>
                  {required ? (
                    <Badge variant="warning">Required</Badge>
                  ) : (
                    <Badge variant="neutral">Optional</Badge>
                  )}
                </div>
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-xs text-zinc-600 shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-primary-700 dark:hover:bg-zinc-800">
                  <Upload className="h-3.5 w-3.5" />
                  {file ? file.name : "Choose file"}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setDocuments((s) => (f ? { ...s, [dt]: f } : s));
                    }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500">Review your application before submitting.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReviewSection title="Your details" fields={COMMON_FIELDS} values={common} />
            <ReviewSection title={`${ROLE_LABELS[roleType]} details`} fields={detailFields} values={details} />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500">Documents attached</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-sm">
              {allDocumentTypes.map((dt) => (
                <li key={dt} className="flex items-center gap-2">
                  {documents[dt] ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-zinc-300" />
                  )}
                  <span className={documents[dt] ? "" : "text-zinc-400"}>
                    {DOCUMENT_TYPE_LABELS[dt]} {documents[dt] ? `— ${documents[dt]!.name}` : "— not attached"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <Button type="button" variant="secondary" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < 3 ? (
          <Button type="button" size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))} disabled={!stepValid}>
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" size="sm" loading={submitting} onClick={handleSubmit} disabled={!allValid}>
            Submit application
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReviewSection({ title, fields, values }: { title: string; fields: FieldConfig[]; values: FormState }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">{title}</p>
      <dl className="mt-1 flex flex-col gap-1 text-sm">
        {fields.map((f) => {
          const v = values[f.key];
          const display =
            f.kind === "checkbox" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") || "—" : v === undefined || v === "" ? "—" : String(v);
          return (
            <div key={f.key} className="flex justify-between gap-3">
              <dt className="text-zinc-500">{f.label}</dt>
              <dd className="text-right font-medium text-zinc-800 dark:text-zinc-200">{display}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
