/** Chat assistant types mirroring backend/schemas/chat.py. */

export interface ChatSourceRef {
  title?: string | null;
  uri?: string | null;
  score?: number | null;
  snippet?: string | null;
}

export interface ChatSessionCreate {
  title?: string;
}

export interface ChatMessageCreate {
  content: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  source_refs?: ChatSourceRef[] | null;
  created_at: string;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatTurnResponse {
  session_id: string;
  message: ChatMessage;
  answer: ChatMessage;
  sources: ChatSourceRef[];
  model: string;
  role_scope: string;
}
