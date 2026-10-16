"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { approveReviewInvoice, getReviewQueue, rejectReviewInvoice, ReviewInvoice } from "@/lib/reviews";

function isFinalStatus(status: string) {
  return ["AMIGA_REVIEWED", "REJECTED", "VOUCHERED", "SENT_TO_CLIENT"].includes(status);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "READY_FOR_REVIEW":
      return "bg-[#CCFBF1] text-[#115E59] border-[#5EEAD4]";
    case "EXCEPTION":
      return "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]";
    case "POSSIBLE_DUPLICATE":
      return "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]";
    case "AMIGA_REVIEWED":
      return "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]";
    default:
      return "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]";
  }
}

export default function ReviewerQueuePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [queue, setQueue] = useState<ReviewInvoice[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  const [exceptionCount, setExceptionCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function loadStatusCounts() {
    try {
      const [ready, exception] = await Promise.all([
        getReviewQueue({ statuses: ["READY_FOR_REVIEW"], limit: 1, offset: 0 }),
        getReviewQueue({ statuses: ["EXCEPTION"], limit: 1, offset: 0 }),
      ]);
      setReadyCount(ready.total);
      setExceptionCount(exception.total);
    } catch {
      // Ignore count failures to keep table usable.
    }
  }

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  async function loadQueue(pageNumber = page) {
    setIsFetching(true);
    setError(null);
    try {
      const statuses = statusFilter === "ALL" ? ["READY_FOR_REVIEW", "EXCEPTION"] : [statusFilter];
      const result = await getReviewQueue({
        statuses,
        limit: pageSize,
        offset: (pageNumber - 1) * pageSize,
      });
      setQueue(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat antrean review.");
    } finally {
      setIsFetching(false);
    }
  }

  async function handleApprove(invoice: ReviewInvoice) {
    if (processingId) return;
    setProcessingId(invoice.id);
    setError(null);
    try {
      await approveReviewInvoice(invoice.id, undefined, invoice.version);
      await loadQueue(page);
      await loadStatusCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui invoice.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(invoice: ReviewInvoice) {
    if (processingId) return;
    const note = window.prompt("Catatan penolakan wajib diisi:");
    if (note === null) return;
    if (!note.trim()) {
      setError("Catatan penolakan wajib diisi.");
      return;
    }
    setProcessingId(invoice.id);
    setError(null);
    try {
      await rejectReviewInvoice(invoice.id, note.trim(), invoice.version);
      await loadQueue(page);
      await loadStatusCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menolak invoice.");
    } finally {
      setProcessingId(null);
    }
  }

  useEffect(() => {
    if (user?.role === "FINANCE_REVIEWER") {
      setPage(1);
      void loadQueue(1);
    }
  }, [user, statusFilter]);

  async function handleChangePage(nextPage: number) {
    if (isFetching || nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    await loadQueue(nextPage);
    setPage(nextPage);
  }

  useEffect(() => {
    if (user?.role === "FINANCE_REVIEWER") {
      void loadStatusCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      activeTab="reviews"
      onTabChange={(tab) => {
        if (tab === "reviews") router.push("/dashboard/reviewer");
        if (tab === "riwayat") router.push("/dashboard/reviewer/history");
      }}
      renderContent={() => (
        <div className="space-y-4">
          <nav className="flex items-center gap-2 text-xs text-[#475569]">
            <span className="hover:text-[#0F172A] transition-colors">Konsol Finance Reviewer</span>
            <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">chevron_right</span>
            <span className="font-semibold text-[#0F172A]">Antrean Review</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#DCFCE7] text-[#166534] flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-[24px]">fact_check</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
                  Verifikasi & Persetujuan Invoice
                </h1>
                <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
                  Reviewer independen memeriksa hasil ekstraksi AI, mengoreksi field, lalu menyetujui atau menolak invoice per klien yang ditugaskan.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-[#CBD5E1] shadow-xs text-xs">
              <span className="px-3 py-1 bg-[#CCFBF1] text-[#115E59] font-bold rounded">
                {readyCount} Siap Review
              </span>
              <span className="px-3 py-1 bg-[#FEF3C7] text-[#92400E] font-bold rounded">
                {exceptionCount} Perlu Koreksi
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[#475569] font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-2.5 rounded border border-[#CBD5E1] text-xs"
              >
                <option value="ALL">Semua Review</option>
                <option value="READY_FOR_REVIEW">READY_FOR_REVIEW</option>
                <option value="EXCEPTION">EXCEPTION</option>
                <option value="POSSIBLE_DUPLICATE">POSSIBLE_DUPLICATE</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void loadQueue()}
              className="px-3 py-1.5 text-xs font-semibold bg-[#1E3A8A] text-white rounded hover:bg-[#1B3380]"
            >
              {isFetching ? "Memuat..." : "Muat Ulang"}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded bg-[#FEE2E2] border border-[#B91C1C] text-[#991B1B] text-xs">{error}</div>
          )}

          <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="h-9 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                  <th className="px-4 py-2">REQUEST ID</th>
                  <th className="px-4 py-2">KLIEN</th>
                  <th className="px-4 py-2">VENDOR &amp; INVOICE</th>
                  <th className="px-4 py-2">REKENING</th>
                  <th className="px-4 py-2">NOMINAL</th>
                  <th className="px-4 py-2">STATUS</th>
                  <th className="px-4 py-2 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {!isFetching && queue.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#94A3B8]">
                      Tidak ada invoice dalam antrean review.
                    </td>
                  </tr>
                )}
                {queue.map((inv) => (
                  <tr key={inv.id} className="h-12 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2 font-mono font-semibold text-[#1E3A8A]">{inv.request_id}</td>
                    <td className="px-4 py-2">{inv.client_name}</td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-[#0F172A]">{inv.vendor_name}</div>
                      <div className="text-[11px] font-mono text-[#94A3B8]">{inv.invoice_number}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px]">{inv.bank_account}</td>
                    <td className="px-4 py-2 font-mono font-bold">{formatRupiah(inv.total_amount)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${statusBadgeClass(inv.status)}`}>
                        {inv.status}
                      </span>
                      {inv.exception_codes?.length > 0 && (
                        <div className="text-[10px] text-[#B91C1C] mt-1">{inv.exception_codes.join(", ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <Link
                          href={`/dashboard/reviewer/${inv.id}?from=queue`}
                          className="px-2.5 py-1 bg-[#1E3A8A] text-white rounded text-[11px] font-semibold hover:bg-[#1B3380]"
                        >
                          Periksa
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleApprove(inv)}
                          disabled={processingId === inv.id || isFinalStatus(inv.status)}
                          className="px-2.5 py-1 bg-[#DCFCE7] text-[#166534] rounded text-[11px] font-semibold hover:bg-[#BBF7D0] disabled:opacity-50"
                          title="Setujui invoice"
                        >
                          Setujui
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReject(inv)}
                          disabled={processingId === inv.id || isFinalStatus(inv.status)}
                          className="px-2.5 py-1 bg-[#FEE2E2] text-[#991B1B] rounded text-[11px] font-semibold hover:bg-[#FECACA] disabled:opacity-50"
                          title="Tolak invoice"
                        >
                          Tolak
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#475569]">
            <span>
              Menampilkan {queue.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + queue.length} dari {total} item
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleChangePage(Math.max(1, page - 1))}
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
                onClick={() => void handleChangePage(Math.min(totalPages, page + 1))}
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

function formatRupiah(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}