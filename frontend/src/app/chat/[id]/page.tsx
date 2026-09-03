"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flag, Languages, MapPin, Paperclip, Send, ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Spinner } from "@/components/ui/Spinner";
import { apiClient, ApiError } from "@/lib/api-client";
import { WS_URL } from "@/lib/constants";
import { cn } from "@/lib/cn";
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

  if (!thread) return <Spinner />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
      <div className="flex items-center gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 text-sm font-semibold text-white">
          {thread.other_party.full_name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{thread.other_party.full_name}</h1>
          <p className="text-xs text-zinc-500">{thread.context_title}</p>
        </div>
      </div>
      {!isPostBooking && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          For your safety, contact details are hidden until a booking is confirmed.
        </p>
      )}
      {isClosed && <p className="mt-3 text-xs text-red-600">This conversation was closed by an admin.</p>}

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
              className="flex-1 rounded-full border border-zinc-300 px-4 py-2.5 text-sm shadow-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              onClick={sendText}
              disabled={sending || !body.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-primary-600 to-indigo-600 text-white shadow-md shadow-primary-600/20 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {isPostBooking && (
            <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
              <button onClick={shareLocation} className="flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400">
                <MapPin className="h-3.5 w-3.5" /> Share location
              </button>
              <label className="flex cursor-pointer items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400">
                <Paperclip className="h-3.5 w-3.5" /> Attach a photo
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
  const [translated, setTranslated] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  const translate = async (targetLang: "en" | "bn") => {
    if (!message.body) return;
    setTranslating(true);
    try {
      const result = await apiClient.post<{ translated_text: string | null }>(
        "/api/v1/chat/translate",
        { text: message.body, target_lang: targetLang },
        { auth: true }
      );
      setTranslated(result.translated_text);
    } catch {
      setTranslated(null);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("group flex flex-col", isMine ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
          isMine
            ? "bg-gradient-to-br from-primary-600 to-indigo-600 text-white"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
        )}
      >
        {message.message_type === "text" && <p>{message.body}</p>}
        {message.message_type === "location" && (
          <a
            href={`https://www.google.com/maps?q=${message.latitude},${message.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 underline"
          >
            <MapPin className="h-3.5 w-3.5" /> Shared location
          </a>
        )}
        {message.message_type === "attachment" && message.attachment && (
          <ChatAttachmentImage threadId={message.thread_id} attachmentId={message.attachment.id} fileName={message.attachment.file_name} />
        )}
        {message.was_redacted && <p className="mt-1 text-[10px] opacity-70">Contact info removed before booking</p>}
        {translated && <p className="mt-1.5 border-t border-white/20 pt-1.5 text-xs italic opacity-90">{translated}</p>}
      </div>
      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100">
        {message.message_type === "text" && (
          <>
            <button
              onClick={() => translate("en")}
              disabled={translating}
              className="flex items-center gap-1 hover:text-primary-600 disabled:opacity-50 dark:hover:text-primary-400"
            >
              <Languages className="h-3 w-3" /> EN
            </button>
            <button
              onClick={() => translate("bn")}
              disabled={translating}
              className="flex items-center gap-1 hover:text-primary-600 disabled:opacity-50 dark:hover:text-primary-400"
            >
              <Languages className="h-3 w-3" /> বাং
            </button>
          </>
        )}
        <button onClick={onReport} aria-label="Report message" className="flex items-center gap-1 hover:text-red-500">
          <Flag className="h-3 w-3" /> Report
        </button>
      </div>
    </motion.div>
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
