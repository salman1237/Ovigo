"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";
import { Notification } from "@/types/notification";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => apiClient.get<{ count: number }>("/api/v1/notifications/unread-count", { auth: true }),
    refetchInterval: 30_000,
  });

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => apiClient.get<Notification[]>("/api/v1/notifications", { auth: true }),
    enabled: open,
  });

  const count = unread?.count ?? 0;

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markRead = async (id: string) => {
    await apiClient.post(`/api/v1/notifications/${id}/read`, undefined, { auth: true });
    refetchAll();
  };

  const markAllRead = async () => {
    await apiClient.post("/api/v1/notifications/read-all", undefined, { auth: true });
    refetchAll();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-full p-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        <BellIcon />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Notifications</span>
              {count > 0 && (
                <button onClick={markAllRead} className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {isLoading && <p className="px-4 py-6 text-center text-sm text-zinc-400">Loading…</p>}
              {!isLoading && (notifications ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-zinc-400">No notifications yet.</p>
              )}
              {(notifications ?? []).map((n) => {
                const body = (
                  <div
                    className={`border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0 dark:border-zinc-900 ${
                      n.is_read ? "" : "bg-zinc-50 dark:bg-zinc-900/50"
                    }`}
                  >
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{n.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                );
                return (
                  <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} className="cursor-pointer">
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
