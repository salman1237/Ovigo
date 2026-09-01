"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { apiClient, ApiError } from "@/lib/api-client";
import { WS_URL } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import type { ChatMessage, ChatThread } from "@/types/chat";

export default function ChatThreadPage() {
  const { id } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: thread } = useQuery({
    queryKey: ["chat", "thread", id],
    queryFn: () => apiClient.get<ChatThread>(`/api/v1/chat/threads/${id}`, { auth: true }),
  });

  const { data: messages } = useQuery({
    queryKey: ["chat", "messages", id],
    queryFn: () => apiClient.get<ChatMessage[]>(`/api/v1/chat/threads/${id}/messages`, { auth: true }),
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["chat", "messages", id] });
    queryClient.invalidateQueries({ queryKey: ["chat", "thread", id] });
    queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
  };

  // mark read once when the thread is opened
  useEffect(() => {
    if (!id) return;
    apiClient.post(`/api/v1/chat/threads/${id}/read`, undefined, { auth: true }).then(refetch).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // live updates over the chat WebSocket
  useEffect(() => {
    if (!id || !accessToken) return;
    const ws = new WebSocket(`${WS_URL}/api/v1/chat/ws/${id}?token=${accessToken}`);
    ws.onmessage = (event) => {
      const incoming: ChatMessage = JSON.parse(event.data);
      queryClient.setQueryData<ChatMessage[]>(["chat", "messages", id], (prev) =>
        prev && !prev.some((m) => m.id === incoming.id) ? [...prev, incoming] : prev
      );
      queryClient.invalidateQueries({ queryKey: ["chat", "threads"] });
    };
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, accessToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isPostBooking = !!thread?.booking_id;
  const isClosed = thread?.status === "closed";

  const sendText = async () => {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/chat/threads/${id}/messages`, { message_type: "text", body }, { auth: true });
      setBody("");
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiClient.post(
            `/api/v1/chat/threads/${id}/messages`,
            { message_type: "location", latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            { auth: true }
          );
          refetch();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Failed to share location");
        }
      },
      () => setError("Couldn't access your location")
    );
  };

  const uploadAttachment = async (file: File) => {
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiClient.postForm(`/api/v1/chat/threads/${id}/attachments`, form, { auth: true });
      refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload attachment");
    }
  };

  const reportMessage = async (messageId: string) => {
    const reason = window.prompt("What's wrong with this message?");
    if (!reason || reason.trim().length < 3) return;
    try {
      await apiClient.post(`/api/v1/chat/messages/${messageId}/report`, { reason }, { auth: true });
      window.alert("Reported to our team — thanks for flagging it.");
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Failed to report message");
    }
  };

  if (!thread) return <p className="px-6 py-12 text-sm text-zinc-400">Loading…</p>;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
      <div className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{thread.other_party.full_name}</h1>
        <p className="text-xs text-zinc-500">{thread.context_title}</p>
        {!isPostBooking && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            For your safety, contact details are hidden until a booking is confirmed.
          </p>
        )}
        {isClosed && <p className="mt-1 text-xs text-red-600">This conversation was closed by an admin.</p>}
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="flex flex-col gap-3">
          {(messages ?? []).map((m) => (
            <MessageBubble key={m.id} message={m} isMine={m.sender_id === currentUserId} onReport={() => reportMessage(m.id)} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!isClosed && (
        <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText()}
              placeholder="Type a message…"
              className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              onClick={sendText}
              disabled={sending || !body.trim()}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              Send
            </button>
          </div>
          {isPostBooking && (
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <button onClick={shareLocation} className="underline">📍 Share location</button>
              <label className="cursor-pointer underline">
                📎 Attach a photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadAttachment(e.target.files[0])}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, isMine, onReport }: { message: ChatMessage; isMine: boolean; onReport: () => void }) {
  return (
    <div className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isMine ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
        }`}
      >
        {message.message_type === "text" && <p>{message.body}</p>}
        {message.message_type === "location" && (
          <a
            href={`https://www.google.com/maps?q=${message.latitude},${message.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            📍 Shared location
          </a>
        )}
        {message.message_type === "attachment" && message.attachment && (
          <ChatAttachmentImage threadId={message.thread_id} attachmentId={message.attachment.id} fileName={message.attachment.file_name} />
        )}
        {message.was_redacted && <p className="mt-1 text-[10px] opacity-70">Contact info removed before booking</p>}
      </div>
      <button onClick={onReport} className="mt-0.5 text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100">
        Report
      </button>
    </div>
  );
}

function ChatAttachmentImage({ threadId, attachmentId, fileName }: { threadId: string; attachmentId: string; fileName: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    apiClient.getBlob(`/api/v1/chat/threads/${threadId}/attachments/${attachmentId}/file`, { auth: true }).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [threadId, attachmentId]);

  if (!url) return <p className="text-xs opacity-70">Loading {fileName}…</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={fileName} className="max-h-64 rounded-lg" />;
}
