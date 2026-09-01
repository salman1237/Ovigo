export type ChatContextType = "tour" | "property" | "vehicle" | "booking_item";
export type ChatThreadStatus = "open" | "closed";
export type ChatMessageType = "text" | "attachment" | "location";

export interface ChatParticipant {
  id: string;
  full_name: string;
  role_type: string | null;
}

export interface ChatAttachment {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_name: string;
  message_type: ChatMessageType;
  body: string | null;
  was_redacted: boolean;
  attachment: ChatAttachment | null;
  latitude: string | null;
  longitude: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ChatThread {
  id: string;
  context_type: ChatContextType;
  context_id: string;
  context_title: string;
  booking_id: string | null;
  status: ChatThreadStatus;
  other_party: ChatParticipant;
  last_message: ChatMessage | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminChatThread {
  id: string;
  context_type: ChatContextType;
  context_id: string;
  context_title: string;
  booking_id: string | null;
  status: ChatThreadStatus;
  traveler: ChatParticipant;
  partner: ChatParticipant;
  reported_message_count: number;
  created_at: string;
  updated_at: string;
}
