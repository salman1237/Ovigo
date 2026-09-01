"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
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
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (threads ?? []).length === 0 && <p className="mt-6 text-sm text-zinc-400">No conversations here.</p>}

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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
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
          {thread.reported_message_count > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              {thread.reported_message_count} reported
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {thread.status}
          </span>
        </div>
      </div>

      {!expanded && (
        <div className="mt-3 flex items-end gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for viewing (required, logged)"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            onClick={viewMessages}
            disabled={busy}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            View messages
          </button>
        </div>
      )}

      {expanded && messages && (
        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-medium">{m.sender_name}: </span>
              {m.message_type === "text" && <span>{m.body}</span>}
              {m.message_type === "location" && <span>📍 shared a location</span>}
              {m.message_type === "attachment" && <span>📎 {m.attachment?.file_name}</span>}
              <span className="ml-2 text-xs text-zinc-400">{new Date(m.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {thread.status === "open" && (
        <button
          onClick={closeThread}
          disabled={busy}
          className="mt-3 rounded-full border border-red-300 px-4 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
        >
          Close conversation
        </button>
      )}
    </div>
  );
}
