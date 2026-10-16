import { apiFetch } from "../client";
import type {
  ChatSessionCreate,
  ChatSessionSummary,
  ChatSessionDetail,
  ChatTurnResponse,
  ChatMessageCreate,
} from "./types";

export const chatService = {
  listSessions(): Promise<ChatSessionSummary[]> {
    return apiFetch<ChatSessionSummary[]>("/api/v1/chat/sessions");
  },
  createSession(payload: ChatSessionCreate = { title: "Percakapan baru" }): Promise<ChatSessionSummary> {
    return apiFetch<ChatSessionSummary>("/api/v1/chat/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getSession(sessionId: string): Promise<ChatSessionDetail> {
    return apiFetch<ChatSessionDetail>(`/api/v1/chat/sessions/${sessionId}`);
  },
  deleteSession(sessionId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/chat/sessions/${sessionId}`, { method: "DELETE" });
  },
  sendMessage(sessionId: string, payload: ChatMessageCreate): Promise<ChatTurnResponse> {
    return apiFetch<ChatTurnResponse>(`/api/v1/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
