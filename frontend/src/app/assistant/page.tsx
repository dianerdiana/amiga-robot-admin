"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageSpinner } from "@/components/invoices/States";
import { chatService } from "@/lib/api";
import type {
  ChatMessage,
  ChatSessionDetail,
  ChatSessionSummary,
  ChatSourceRef,
  ChatTurnResponse,
} from "@/lib/api";

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function AssistantContent() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSessionDetail | null>(null);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  const loadSessions = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSessions(true);
    setError(null);
    try {
      const data = await chatService.listSessions();
      setSessions(data ?? []);
      if (data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].id);
      }
      if (data.length === 0) {
        const created = await chatService.createSession({ title: "Percakapan baru" });
        setSessions([created]);
        setActiveSessionId(created.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat sesi chat.");
    } finally {
      setLoadingSessions(false);
    }
  }, [user?.id]);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingMessages(true);
    setError(null);
    try {
      const detail = await chatService.getSession(sessionId);
      setActiveSession(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat isi chat.");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) void loadSessions();
  }, [user?.id]);

  useEffect(() => {
    if (activeSessionId) void loadSession(activeSessionId);
    else setActiveSession(null);
  }, [activeSessionId, loadSession]);

  async function createNewChat() {
    setError(null);
    try {
      const created = await chatService.createSession({ title: "Percakapan baru" });
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat chat baru.");
    }
  }

  async function sendMessage() {
    if (!activeSessionId || !composer.trim() || sending) return;
    const text = composer.trim();
    setComposer("");
    setError(null);
    setSending(true);
    // append local user echo until server returns authoritative rows
    const previousMessages = activeSession?.messages ?? [];
    setActiveSession((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: `local-user-${Date.now()}`,
                session_id: activeSessionId,
                role: "user",
                content: text,
                source_refs: null,
                created_at: new Date().toISOString(),
              },
            ],
          }
        : prev
    );

    try {
      const result: ChatTurnResponse = await chatService.sendMessage(activeSessionId, { content: text });
      setActiveSession((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages.filter((m) => !m.id.startsWith("local-user-")),
                { ...result.message },
                { ...result.answer },
              ],
            }
          : prev
      );
      // refresh server-side truth for sources etc.
      await loadSession(activeSessionId);
      await chatService.listSessions().then(setSessions).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim pesan ke asisten.");
    } finally {
      setSending(false);
    }
  }

  async function removeSession(sessionId: string) {
    try {
      await chatService.deleteSession(sessionId);
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setSessions(remaining);
      if (activeSessionId === sessionId) {
        setActiveSessionId(remaining.length ? remaining[0].id : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus sesi.");
    }
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const roleLabel = user.role ?? "User";

  return (
    <DashboardLayout activeTab="assistant" onTabChange={() => undefined} renderContent={() => (
      <section className="flex h-full w-full flex-col gap-4 lg:flex-row">
        <aside className="w-full rounded-lg border border-[#CBD5E1] bg-white lg:w-72 lg:shrink-0">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">Riwayat Chat</h2>
              <p className="text-[11px] text-[#64748B]">Asisten skill-oriented untuk {roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void createNewChat()}
              className="flex h-8 items-center gap-1 rounded-md bg-[#1E3A8A] px-3 text-xs font-semibold text-white hover:bg-[#1B3380]"
            >
              <span className="material-symbols-outlined text-[17px]">add</span>
              Baru
            </button>
          </div>

          <nav className="flex max-h-[360px] flex-col gap-1 overflow-y-auto p-2 lg:max-h-[calc(100vh-180px)]">
            {loadingSessions && <div className="px-3 py-2 text-xs text-[#64748B]">Memuat...</div>}
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    active ? "border-[#1E3A8A] bg-[#EFF3FF] text-[#1E3A8A]" : "border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]"
                  }`}
                >
                  <button type="button" onClick={() => setActiveSessionId(session.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate font-semibold">{session.title}</div>
                    <div className="mt-0.5 text-[10px] opacity-70">{formatTime(session.updated_at)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSession(session.id)}
                    aria-label="Hapus sesi"
                    className="shrink-0 rounded p-1 hover:bg-[#FEE2E2] hover:text-[#991B1B]"
                    title="Hapus"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              );
            })}
            {!loadingSessions && sessions.length === 0 && (
              <div className="px-3 py-3 text-xs text-[#64748B]">Belum ada percakapan.</div>
            )}
          </nav>
        </aside>

        <div className="flex min-h-[560px] flex-1 flex-col rounded-lg border border-[#CBD5E1] bg-white">
          <header className="border-b border-[#E2E8F0] px-4 py-3">
            <h1 className="text-lg font-bold text-[#0F172A]">Asisten AMIGA</h1>
            <p className="text-xs text-[#64748B]">
              Informasi role-aware dan pengetahuan internal AMIGA, hanya mode read-only. Data sensitif tidak ditampilkan.
            </p>
          </header>

          <main className="flex-1 overflow-auto px-4 py-4">
            {loadingMessages && (
              <div className="flex justify-center">
                <PageSpinner label="Memuat pesan..." />
              </div>
            )}
            {!loadingMessages && (activeSession?.messages ?? []).length === 0 && (
              <div className="mx-auto max-w-xl rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center">
                <span className="material-symbols-outlined text-[38px] text-[#94A3B8]">smart_toy</span>
                <p className="mt-2 text-sm font-semibold text-[#0F172A]">Mulai percakapan baru</p>
                <p className="mt-1 text-xs text-[#64748B]">
                  Tanyakan status queue, klien assigned, ringkasan voucher, atau informasi aplikasi AMIGA.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    "Ringkaskan status antrian review saya",
                    "Apa client yang saya handle?",
                    "Jelaskan alur invoice dan review",
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setComposer(chip)}
                      className="rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-medium text-[#1E3A8A] hover:bg-[#EFF3FF]"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-auto flex max-w-3xl flex-col gap-3">
              {(activeSession?.messages ?? []).map((msg, index) => {
                const isUser = msg.role === "user";
                const sources = Array.isArray(msg.source_refs) ? msg.source_refs : [];
                return (
                  <div key={msg.id ?? index} className="flex gap-3">
                    <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${isUser ? "ml-auto bg-[#1E3A8A] text-white" : "bg-[#F1F5F9] text-[#0F172A]"}`}>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      {!isUser && sources.length > 0 && (
                        <div className="mt-3 border-t border-[#D6DCE7] pt-2 text-[11px] text-[#475569]">
                          <strong>Referensi:</strong>
                          {sources.map((source: ChatSourceRef, idx) => (
                            <div key={idx} className="mt-1">
                              {source.title ?? source.uri ?? "Dokumen AMIGA"}
                              {source.snippet ? ` — ${source.snippet}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </main>

          {error && (
            <div className="mx-4 mb-3 rounded border border-[#B91C1C] bg-[#FEE2E2] px-3 py-2 text-xs text-[#991B1B]">{error}</div>
          )}

          <footer className="border-t border-[#E2E8F0] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void sendMessage();
                }}
                rows={2}
                placeholder="Tanya seputar aplikasi AMIGA... (Ctrl+Enter kirim)"
                className="min-h-[48px] flex-1 rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2563EB]"
                disabled={!activeSessionId || sending}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!activeSessionId || sending || !composer.trim()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#1E3A8A] px-4 text-xs font-semibold text-white disabled:bg-[#CBD5E1]"
              >
                <span className="material-symbols-outlined text-[18px]">{sending ? "hourglass_top" : "send"}</span>
                {sending ? "Kirim..." : "Kirim"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[#64748B]">
              Mode read-only: jawaban berbasis data yang Anda terapkan dan pengetahuan internal AMIGA.
            </p>
          </footer>
        </div>
      </section>
    )} />
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<PageSpinner label="Memuat asisten AI..." />}>
      <AssistantContent />
    </Suspense>
  );
}
