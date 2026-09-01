"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Paperclip } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { AdminChatThread, ChatMessage } from "@/types/chat";

const TABS = ["reported", "open", "closed", "all"] as const;
type Tab = (typeof TABS)[number];

export default function AdminChatPage() {
  const [tab, setTab] = useState<Tab>("reported");
  const queryClient = useQueryClient();

  const params = tab === "reported" ? "reported_only=true" : tab === "all" ? "" : `status=${tab}`;
  const { data: threads, isLoading } = useQuery({
    queryKey: ["admin-chat-threads", tab],
    queryFn: () => apiClient.get<AdminChatThread[]>(`/api/v1/admin/chat/threads${params ? `?${params}` : ""}`, { auth: true }),
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-chat-threads"] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Chat Moderation</h1>

      <div className="mt-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {!isLoading && (threads ?? []).length === 0 && (
        <div className="mt-6">
          <EmptyState title="No conversations here" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {(threads ?? []).map((t) => (
          <AdminThreadCard key={t.id} thread={t} onChange={refetch} />
        ))}
      </div>
    </div>
  );
}

function AdminThreadCard({ thread, onChange }: { thread: AdminChatThread; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const viewMessages = async () => {
    if (!reason.trim() || reason.trim().length < 3) {
      setError("Enter a reason for viewing this conversation (logged in the audit trail).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.get<ChatMessage[]>(
        `/api/v1/admin/chat/threads/${thread.id}/messages?reason=${encodeURIComponent(reason)}`,
        { auth: true }
      );
      setMessages(result);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load messages");
    } finally {
      setBusy(false);
    }
  };

  const closeThread = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/admin/chat/threads/${thread.id}/close`, undefined, { auth: true });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close conversation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
            {thread.traveler.full_name} ↔ {thread.partner.full_name}
          </h3>
          <p className="text-xs text-zinc-500">
            {thread.context_title} · {thread.booking_id ? "post-booking" : "pre-booking inquiry"} ·{" "}
            {new Date(thread.updated_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {thread.reported_message_count > 0 && <Badge variant="danger">{thread.reported_message_count} reported</Badge>}
          <Badge className="capitalize">{thread.status}</Badge>
        </div>
      </div>

      {!expanded && (
        <div className="mt-3 flex items-end gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for viewing (required, logged)" className="flex-1" />
          <Button size="sm" variant="secondary" onClick={viewMessages} loading={busy}>
            View messages
          </Button>
        </div>
      )}

      {expanded && messages && (
        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-medium">{m.sender_name}: </span>
              {m.message_type === "text" && <span>{m.body}</span>}
              {m.message_type === "location" && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> shared a location
                </span>
              )}
              {m.message_type === "attachment" && (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" /> {m.attachment?.file_name}
                </span>
              )}
              <span className="ml-2 text-xs text-zinc-400">{new Date(m.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {thread.status === "open" && (
        <Button size="sm" variant="destructive" onClick={closeThread} loading={busy} className="mt-3">
          Close conversation
        </Button>
      )}
    </Card>
  );
}
