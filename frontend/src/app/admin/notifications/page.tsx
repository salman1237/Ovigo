"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { CAMPAIGN_AUDIENCE_LABELS, CampaignAudience, NotificationCampaign, NotificationTemplate } from "@/types/notification-admin";

const PARTNER_ROLE_TYPES = ["local_expert", "host", "guide", "hotel", "rent_a_car"] as const;

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<"send" | "templates" | "history">("send");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Notifications</h1>
      <p className="mt-1 text-sm text-zinc-500">Reusable templates and admin-broadcast campaigns — delivered in-app only (no email/SMS/push provider configured yet).</p>

      <div className="mt-4 flex gap-2">
        {(["send", "templates", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t === "send" ? "Send campaign" : t}
          </button>
        ))}
      </div>

      {tab === "send" && <SendCampaignTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

function SendCampaignTab() {
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<CampaignAudience>("all_users");
  const [roleType, setRoleType] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: templates } = useQuery({
    queryKey: ["admin-notification-templates"],
    queryFn: () => apiClient.get<NotificationTemplate[]>("/api/v1/admin/notifications/templates", { auth: true }),
  });

  const send = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const campaign = await apiClient.post<NotificationCampaign>(
        "/api/v1/admin/notifications/campaigns",
        {
          template_id: templateId || undefined,
          title: templateId ? undefined : title,
          message: templateId ? undefined : message,
          audience,
          audience_role_type: audience === "partners_only" && roleType ? roleType : undefined,
          is_urgent: isUrgent,
        },
        { auth: true }
      );
      setResult(`Sent to ${campaign.recipient_count} recipient(s).`);
      setTitle("");
      setMessage("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Use a template (optional)</label>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-auto">
            <option value="">Ad-hoc message</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>

        {!templateId && (
          <>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message" rows={3} />
          </>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Audience</label>
            <Select value={audience} onChange={(e) => setAudience(e.target.value as CampaignAudience)} className="w-auto">
              {Object.entries(CAMPAIGN_AUDIENCE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
          {audience === "partners_only" && (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Partner type (optional)</label>
              <Select value={roleType} onChange={(e) => setRoleType(e.target.value)} className="w-auto">
                <option value="">Any partner type</option>
                {PARTNER_ROLE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>{rt.replace("_", " ")}</option>
                ))}
              </Select>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
            Mark urgent
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && <p className="text-sm text-emerald-600">{result}</p>}

        <Button
          onClick={send}
          loading={busy}
          disabled={!templateId && (!title || !message)}
          className="self-start"
        >
          Send campaign
        </Button>
      </div>
    </Card>
  );
}

function TemplatesTab() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin-notification-templates"],
    queryFn: () => apiClient.get<NotificationTemplate[]>("/api/v1/admin/notifications/templates", { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-notification-templates"] });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="mt-6">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {isLoading && <Spinner />}
      {!isLoading && (templates ?? []).length === 0 && <EmptyState title="No templates yet" />}
      <div className="flex flex-col gap-3">
        {(templates ?? []).map((t) => (
          <Card key={t.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{t.name}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.subject}</p>
              <p className="mt-1 text-xs text-zinc-500">{t.body}</p>
            </div>
            <button
              onClick={() => run(() => apiClient.delete(`/api/v1/admin/notifications/templates/${t.id}`, { auth: true }))}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Delete
            </button>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">New template</h3>
        <div className="mt-3 flex flex-col gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject / title" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" rows={3} />
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              run(() => apiClient.post("/api/v1/admin/notifications/templates", { name, subject, body }, { auth: true }));
              setName("");
              setSubject("");
              setBody("");
            }}
            disabled={!name || !subject || !body}
          >
            Create template
          </Button>
        </div>
      </Card>
    </div>
  );
}

function HistoryTab() {
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["admin-notification-campaigns"],
    queryFn: () => apiClient.get<NotificationCampaign[]>("/api/v1/admin/notifications/campaigns", { auth: true }),
  });

  return (
    <div className="mt-6 flex flex-col gap-3">
      {isLoading && <Spinner />}
      {!isLoading && (campaigns ?? []).length === 0 && <EmptyState title="No campaigns sent yet" />}
      {(campaigns ?? []).map((c) => (
        <Card key={c.id}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{c.title}</p>
            <div className="flex gap-2">
              {c.is_urgent && <Badge variant="danger">Urgent</Badge>}
              <Badge variant="neutral">{CAMPAIGN_AUDIENCE_LABELS[c.audience]}{c.audience_role_type ? ` · ${c.audience_role_type}` : ""}</Badge>
            </div>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{c.message}</p>
          <p className="mt-1 text-xs text-zinc-500">{c.recipient_count} recipient(s) · {new Date(c.created_at).toLocaleString()}</p>
        </Card>
      ))}
    </div>
  );
}
