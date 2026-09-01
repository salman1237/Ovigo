"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { ChatThread } from "@/types/chat";

export default function ChatInboxPage() {
  const user = useAuthStore((s) => s.user);

  const { data: threads, isLoading } = useQuery({
    queryKey: ["chat", "threads"],
    queryFn: () => apiClient.get<ChatThread[]>("/api/v1/chat/threads", { auth: true }),
    enabled: !!user,
    refetchInterval: 15_000,
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <p className="text-sm text-zinc-500">
          <a href="/account/login" className="font-medium underline">Sign in</a> to view your messages.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Messages</h1>

      {isLoading && <p className="mt-6 text-sm text-zinc-400">Loading…</p>}
      {!isLoading && (threads ?? []).length === 0 && (
        <p className="mt-6 text-sm text-zinc-400">No conversations yet — message a partner from a tour, stay or vehicle page.</p>
      )}

      <div className="mt-6 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
        {(threads ?? []).map((t) => (
          <Link
            key={t.id}
            href={`/chat/${t.id}`}
            className="flex items-start justify-between gap-3 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                {t.other_party.full_name}
                {t.status === "closed" && <span className="ml-2 text-xs font-normal text-zinc-400">(closed)</span>}
              </p>
              <p className="truncate text-xs text-zinc-500">{t.context_title}</p>
              {t.last_message && (
                <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {t.last_message.message_type === "text"
                    ? t.last_message.body
                    : t.last_message.message_type === "location"
                      ? "📍 Shared a location"
                      : "📎 Sent an attachment"}
                </p>
              )}
            </div>
            {t.unread_count > 0 && (
              <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                {t.unread_count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
