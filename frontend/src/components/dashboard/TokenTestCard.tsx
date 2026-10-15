"use client";

import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredTokens, AuthTokens } from "@/lib/api";

export default function TokenTestCard() {
  const { user, simulateExpiredTokenRetry } = useAuth();
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentTokens, setCurrentTokens] = useState<AuthTokens | null>(() => {
    return getStoredTokens();
  });

  const handleTestExpiredTokenRetry = async () => {
    setIsTesting(true);
    setTestLogs([]);

    const addLog = (msg: string) => {
      setTestLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${msg}`,
      ]);
    };

    try {
      addLog(" Memulai simulasi: Merusak access token di localStorage menjadi token kedaluwarsa...");
      const oldTokens = getStoredTokens();
      addLog(` Token lama: ${oldTokens?.accessToken.substring(0, 16)}...`);

      addLog(" Memanggil endpoint terproteksi /auth/me menggunakan token yang kedaluwarsa...");
      addLog(" Interceptor menangkap respon 401 Unauthorized secara transparan.");
      addLog(" Mengirim request ke /auth/refresh-token menggunakan refresh token yang masih valid...");

      const updatedUser = await simulateExpiredTokenRetry();

      const newTokens = getStoredTokens();
      setCurrentTokens(newTokens);
      addLog(` Backend berhasil merespon dengan access token baru: ${newTokens?.accessToken.substring(0, 16)}...`);
      addLog(" Interceptor otomatis melakukan RETRY pada pemanggilan /auth/me yang sempat gagal...");
      addLog(` BERHASIL! Data profil terverifikasi: ${updatedUser.name} (${updatedUser.role})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(` Gagal selama uji coba: ${msg}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-xs overflow-hidden mt-8">
      {/* Header Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-[#F8FAFC] border-b border-[#CBD5E1] flex items-center justify-between text-left hover:bg-[#F1F5F9] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#1E3A8A] text-[20px]">
            developer_mode
          </span>
          <div>
            <span className="font-bold text-xs text-[#0F172A] block">
              Diagnostik Pengembang: Uji Interceptor &amp; Auto-Retry Refresh Token
            </span>
            <span className="text-[11px] text-[#475569]">
              Simulasi kadaluwarsa access token dan perpanjangan sesi otomatis ke backend FastAPI.
            </span>
          </div>
        </div>
        <span className="material-symbols-outlined text-[18px] text-[#475569]">
          {isOpen ? "expand_less" : "expand_more"}
        </span>
      </button>

      {isOpen && (
        <div className="p-4 sm:p-6 space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
            <p className="text-xs text-[#475569]">
              Klik tombol di samping untuk merusak token di memori klien, memicu HTTP 401, refresh token, dan retry otomatis.
            </p>
            <button
              type="button"
              onClick={handleTestExpiredTokenRetry}
              disabled={isTesting}
              className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1B3380] active:bg-[#172B6B] disabled:bg-[#CBD5E1] text-white font-semibold rounded shadow-xs transition-colors shrink-0"
            >
              {isTesting ? "Sedang Menguji..." : "Jalankan Simulasi Token Expired"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-2.5 rounded bg-[#F8FAFC] border border-[#CBD5E1]">
              <span className="text-[11px] font-semibold text-[#475569] block mb-1">
                Access Token Aktif:
              </span>
              <div className="font-mono text-[11px] text-[#1E3A8A] truncate select-all">
                {currentTokens?.accessToken || "Tidak ada"}
              </div>
            </div>
            <div className="p-2.5 rounded bg-[#F8FAFC] border border-[#CBD5E1]">
              <span className="text-[11px] font-semibold text-[#475569] block mb-1">
                Refresh Token Aktif:
              </span>
              <div className="font-mono text-[11px] text-[#475569] truncate select-all">
                {currentTokens?.refreshToken || "Tidak ada"}
              </div>
            </div>
          </div>

          <div className="bg-[#0F172A] rounded p-3 font-mono text-[11px] text-white min-h-[120px] max-h-[200px] overflow-y-auto">
            <div className="text-emerald-400 font-semibold mb-1">
              # Log Interceptor:
            </div>
            {testLogs.length === 0 ? (
              <span className="text-slate-400 italic">
                Belum ada simulasi yang dijalankan.
              </span>
            ) : (
              testLogs.map((log, i) => <div key={i}>{log}</div>)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
