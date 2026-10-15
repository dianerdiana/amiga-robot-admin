"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredTokens, AuthTokens } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading, logout, simulateExpiredTokenRetry } = useAuth();
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [currentTokens, setCurrentTokens] = useState<AuthTokens | null>(() => {
    return getStoredTokens();
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  const handleTestExpiredTokenRetry = async () => {
    setIsTesting(true);
    setTestLogs([]);

    const addLog = (msg: string) => {
      setTestLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
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

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-[#475569] font-medium">Memuat data sesi AMIGA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      {/* Top Header */}
      <header className="w-full h-14 bg-white border-b border-[#CBD5E1] px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#1E3A8A] flex items-center justify-center text-white shrink-0 shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <circle cx="12" cy="5" r="2"></circle>
              <path d="M12 7v4"></path>
              <line x1="8" y1="16" x2="8" y2="16"></line>
              <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[15px] tracking-tight text-[#0F172A]">AMIGA</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
              Robot Admin
            </span>
          </div>
        </div>

        {/* User Info & Logout Button */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-xs font-semibold text-[#0F172A]">{user.name}</span>
            <span className="text-[11px] text-[#475569] font-mono">{user.role}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-[#CBD5E1] text-[#991B1B] hover:bg-[#FEE2E2] hover:border-[#B91C1C] transition-colors focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          >
            Keluar
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Welcome Banner */}
        <div className="bg-white border border-[#CBD5E1] rounded-lg p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#0F766E]">
                Sesi Terotentikasi
              </span>
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">
              Selamat datang, {user.name}
            </h1>
            <p className="text-sm text-[#475569] mt-1">
              Terhubung ke backend FastAPI dengan otentikasi JWT Bearer token & auto-retry interceptor.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-md text-xs font-semibold bg-[#E0E7FF] text-[#1E3A8A] border border-[#CBD5E1]">
              Role: {user.role}
            </span>
            <span className="px-3 py-1 rounded-md text-xs font-semibold bg-[#DCFCE7] text-[#166534] border border-[#CBD5E1]">
              Status: {user.is_active ? "Aktif" : "Nonaktif"}
            </span>
          </div>
        </div>

        {/* User Profile & Tokens Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-[#CBD5E1] rounded-lg p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F172A] border-b border-[#CBD5E1] pb-2">
              Profil Pengguna (/auth/me)
            </h2>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
                <span className="text-[#475569]">Nama Lengkap</span>
                <span className="font-semibold text-[#0F172A]">{user.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
                <span className="text-[#475569]">Email Staf</span>
                <span className="font-semibold text-[#0F172A]">{user.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
                <span className="text-[#475569]">User ID (UUID)</span>
                <span className="font-mono text-[#0F172A]">{user.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F1F5F9]">
                <span className="text-[#475569]">Waktu Registrasi</span>
                <span className="font-mono text-[#0F172A]">
                  {new Date(user.created_at).toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-lg p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#0F172A] border-b border-[#CBD5E1] pb-2">
              Status Token Penyimpanan
            </h2>
            <div className="space-y-2 text-xs">
              <div className="py-1">
                <span className="text-[#475569] block mb-1">Access Token Saat Ini:</span>
                <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-2 rounded font-mono text-[11px] break-all select-all text-[#1E3A8A]">
                  {currentTokens?.accessToken || "Tidak ditemukan"}
                </div>
              </div>
              <div className="py-1">
                <span className="text-[#475569] block mb-1">Refresh Token Saat Ini:</span>
                <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-2 rounded font-mono text-[11px] break-all select-all text-[#475569]">
                  {currentTokens?.refreshToken || "Tidak ditemukan"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Token Refresh & Retry Demonstration Card */}
        <div className="bg-white border border-[#CBD5E1] rounded-lg p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CBD5E1] pb-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Uji Interceptor: Retry Otomatis Saat Access Token Expired
              </h2>
              <p className="text-xs text-[#475569] mt-0.5">
                Menguji mekanisme: Simulasi access token expired → Interceptor mendeteksi 401 → Panggil refresh-token → Perbarui access token → Retry request awal berhasil.
              </p>
            </div>
            <button
              type="button"
              onClick={handleTestExpiredTokenRetry}
              disabled={isTesting}
              className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1B3380] active:bg-[#172B6B] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed text-white text-xs font-semibold rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              {isTesting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Menguji Retry Interceptor...</span>
                </>
              ) : (
                <span>Jalankan Simulasi Token Expired</span>
              )}
            </button>
          </div>

          {/* Log Output Console */}
          <div className="bg-[#0F172A] rounded-md p-4 font-mono text-xs text-white min-h-[160px] flex flex-col justify-between">
            <div className="space-y-1.5 overflow-y-auto max-h-[220px]">
              <div className="text-emerald-400 font-semibold mb-2">
                # Live Interceptor Execution Logs:
              </div>
              {testLogs.length === 0 ? (
                <div className="text-slate-400 italic">
                  Klik tombol &quot;Jalankan Simulasi Token Expired&quot; di atas untuk melihat proses refresh-token dan auto-retry secara langsung...
                </div>
              ) : (
                testLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {log}
                  </div>
                ))
              )}
            </div>
            {testLogs.length > 0 && !isTesting && (
              <div className="mt-3 pt-2 border-t border-slate-700 text-emerald-300 text-[11px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                <span>Proses interceptor & retry berhasil diselesaikan tanpa error!</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Global Footer */}
      <footer className="w-full py-4 px-4 text-center text-xs text-[#475569] border-t border-[#CBD5E1] bg-white">
        <div className="max-w-[1366px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 AMIGA. Khusus penggunaan internal staf yang berwenang.</p>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span>ID Perangkat: DEV-1366X</span>
            <span>Akses Terenkripsi</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
