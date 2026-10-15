"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ReviewInvoice, getReviewQueue } from "@/lib/reviews";

export default function ReviewerHistoryPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [rows, setRows] = useState<ReviewInvoice[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function loadStatusCounts() {
    try {
      const [approved, rejected] = await Promise.all([
        getReviewQueue({ statuses: ["AMIGA_REVIEWED"], limit: 1, offset: 0 }),
        getReviewQueue({ statuses: ["REJECTED"], limit: 1, offset: 0 }),
      ]);
      setApprovedCount(approved.total);
      setRejectedCount(rejected.total);
    } catch {
      // Ignore
    }
  }

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  async function load(pageNumber = page) {
    setIsFetching(true);
    setError(null);
    try {
      const statuses = statusFilter === "ALL" ? ["AMIGA_REVIEWED", "REJECTED"] : [statusFilter];
      const result = await getReviewQueue({
        statuses,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat.");
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (user?.role === "FINANCE_REVIEWER") void load(page);
  }, [user, statusFilter, page]);

  useEffect(() => {
    if (user?.role === "FINANCE_REVIEWER") void loadStatusCounts();
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout
      activeTab="riwayat"
      onTabChange={(tab) => {
        if (tab === "reviews") router.push("/dashboard/reviewer");
        if (tab == "riwayat") router.push("/dashboard/reviewer/history");
      }}
      renderContent={() => (
        <div className="space-y-4">
          <nav className="flex items-center gap-2 text-xs text-[#475569]">
            <span className="hover:text-[#0F172A] transition-colors">Konsol Finance Reviewer</span>
            <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">chevron_right</span>
            <span className="font-semibold text-[#0F172A]">Riwayat Review</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#E0E7FF] text-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[24px]">history</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
                  Riwayat Review & Audit Trail
                </h1>
                <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
                  Invoice yang sudah diputuskan, lengkap dengan catatan koreksi, persetujuan, atau penolakan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-[#CBD5E1] shadow-xs text-xs">
              <span className="px-3 py-1 bg-[#DCFCE7] text-[#166534] font-bold rounded">
                {approvedCount} Disetujui              </span>
              <span className="px-3 py-1 bg-[#FEE2E2] text-[#991B1B] font-bold rounded">
                {rejectedCount} Ditolak
              </span>
            </div>
          </div>

          {error && <div className="p-3 rounded bg-[#FEE2E2] border border-[#B91C1C] text-[#991B1B] text-xs">{error}</div>}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#475569] font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-2.5 rounded border border-[#CBD5E1] text-xs"
              >
                <option value="ALL">Semua Keputusan</option>
                <option value="AMIGA_REVIEWED">AMIGA_REVIEWED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void load(page)}
              className="px-3 py-1.5 text-xs font-semibold bg-[#1E3A8A] text-white rounded hover:bg-[#1B3380]"
            >
              {isFetching ? "Memuat..." : "Muat Ulang"}
            </button>
          </div>

          <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="h-9 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                  <th className="px-4 py-2">REQUEST ID</th>
                  <th className="px-4 py-2">KLIEN</th>
                  <th className="px-4 py-2">VENDOR</th>
                  <th className="px-4 py-2">NOMINAL</th>
                  <th className="px-4 py-2">KEPUTUSAN</th>
                  <th className="px-4 py-2 text-right">DETAIL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {isFetching && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#94A3B8]">Memuat...</td></tr>}
                {!isFetching && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#94A3B8]">Belum ada riwayat review.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.id} className="h-12 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2 font-mono font-semibold text-[#1E3A8A]">{r.request_id}</td>
                    <td className="px-4 py-2">{r.client_name}</td>
                    <td className="px-4 py-2">{r.vendor_name}</td>
                    <td className="px-4 py-2 font-mono font-bold">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(r.total_amount ?? 0)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${r.status === "AMIGA_REVIEWED" ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]" : "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/dashboard/reviewer/${r.id}?from=history`} className="px-2.5 py-1 bg-[#1E3A8A] text-white rounded text-[11px] font-semibold hover:bg-[#1B3380]">
                        Audit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#475569]">
            <span>
              Menampilkan {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} dari {total} item
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="px-3 py-1.5 rounded border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <span className="font-mono">
                Halaman {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
                className="px-3 py-1.5 rounded border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}
    />
  );
}