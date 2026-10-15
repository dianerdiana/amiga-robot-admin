"use client";

import Link from "next/link";
import React, { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  ReviewInvoice,
  ReviewAuditLog,
  approveReviewInvoice,
  getReviewAudit,
  getReviewInvoice,
  rejectReviewInvoice,
  correctReviewInvoice,
} from "@/lib/reviews";
import { InvoiceFileUrl, invoiceService } from "@/lib/api";

export function ReviewerDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const fromHistory =
    searchParams.get("from") === "history" ||
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "history") ||
    (typeof document !== "undefined" && document.referrer.includes("/dashboard/reviewer/history"));
  const backTarget = fromHistory ? "/dashboard/reviewer/history" : "/dashboard/reviewer";
  const listLabel = fromHistory ? "Riwayat Review" : "Antrean Review";
  const { user, isLoading } = useAuth();

  const [invoice, setInvoice] = useState<ReviewInvoice | null>(null);
  const [audit, setAudit] = useState<ReviewAuditLog[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<InvoiceFileUrl | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  async function load() {
    if (!id) return;
    setIsFetching(true);
    setError(null);
    try {
      const data = await getReviewInvoice(id);
      setInvoice(data);
      setVendorName(data.vendor_name ?? "");
      setInvoiceNumber(data.invoice_number ?? "");
      setBankAccount(data.bank_account ?? "");
      setTotalAmount(data.total_amount != null ? String(data.total_amount) : "");
      const logs = await getReviewAudit(id);
      setAudit(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat invoice.");
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => {
    if (user) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  useEffect(() => {
    if (!invoice?.id) return;
    let cancelled = false;
    setFileUrl(null);
    setFileError(null);
    setFileLoading(true);
    invoiceService
      .fileUrl(invoice.id)
      .then((result) => {
        if (!cancelled) setFileUrl(result);
      })
      .catch((error) => {
        if (!cancelled) setFileError(error instanceof Error ? error.message : "Berkas asli tidak dapat dimuat.");
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

  async function handleCorrect() {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    setActionMessage(null);
    try {
      const updated = await correctReviewInvoice(invoice.id, {
        vendor_name: vendorName,
        invoice_number: invoiceNumber,
        bank_account: bankAccount,
        total_amount: totalAmount ? Number(totalAmount) : undefined,
        expected_version: invoice.version,
      });
      setInvoice(updated);
      const logs = await getReviewAudit(invoice.id);
      setAudit(logs);
      setActionMessage("Perubahan berhasil disimpan dan validasi dijalankan ulang.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan koreksi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    setActionMessage(null);
    try {
      const updated = await approveReviewInvoice(invoice.id, undefined, invoice.version);
      setInvoice(updated);
      setActionMessage("Invoice berhasil disetujui (AMIGA_REVIEWED).");
      const logs = await getReviewAudit(invoice.id);
      setAudit(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyetujui invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!invoice) return;
    if (!rejectNote.trim()) {
      setError("Catatan penolakan wajib diisi.");
      return;
    }
    setSaving(true);
    setError(null);
    setActionMessage(null);
    try {
      const updated = await rejectReviewInvoice(invoice.id, rejectNote.trim(), invoice.version);
      setInvoice(updated);
      setActionMessage("Invoice berhasil ditolak.");
      const logs = await getReviewAudit(invoice.id);
      setAudit(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menolak invoice.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isFinal = invoice ? ["AMIGA_REVIEWED", "REJECTED", "VOUCHERED", "SENT_TO_CLIENT"].includes(invoice.status) : false;
  const pageTitle = invoice
    ? `${isFinal ? "Riwayat Review & Audit" : "Pemeriksaan & Koreksi Invoice"}: ${invoice.request_id}`
    : "Detail Invoice";

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(backTarget);
    }
  }

  return (
    <DashboardLayout
      activeTab={fromHistory ? "riwayat" : "reviews"}
      onTabChange={(tab) => {
        if (tab === "reviews") router.push("/dashboard/reviewer");
        if (tab === "riwayat") router.push("/dashboard/reviewer/history");
      }}
      renderContent={() => (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#475569] border border-[#CBD5E1] rounded bg-white hover:bg-[#F1F5F9] w-fit"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Kembali ke {listLabel}
            </button>
            {invoice && (
              <span
                className={`inline-flex items-center px-3 py-1.5 rounded text-xs font-bold border ${
                  isFinal
                    ? invoice.status === "AMIGA_REVIEWED"
                      ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
                      : "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]"
                    : "bg-[#CCFBF1] text-[#115E59] border-[#5EEAD4]"
                }`}
              >
                {invoice.status}
              </span>
            )}
          </div>

          <nav className="flex items-center gap-2 text-xs text-[#475569]">
            <span className="hover:text-[#0F172A] transition-colors">Konsol Finance Reviewer</span>
            <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">chevron_right</span>
            <span className="hover:text-[#0F172A] transition-colors">{listLabel}</span>
            <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">chevron_right</span>
            <span className="font-semibold text-[#0F172A]">{invoice ? (isFinal ? "Audit Invoice" : "Periksa Invoice") : "Detail Invoice"}</span>
          </nav>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              {pageTitle}
            </h1>
            {invoice && (
              <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
                {invoice.client_name} • {invoice.vendor_name} • v{invoice.version} • {invoice.original_filename}
              </p>
            )}
          </div>

          {isFetching && <div className="text-xs text-[#475569]">Memuat data invoice...</div>}
          {error && <div className="p-3 rounded bg-[#FEE2E2] border border-[#B91C1C] text-[#991B1B] text-xs">{error}</div>}
          {actionMessage && <div className="p-3 rounded bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs">{actionMessage}</div>}

          {invoice && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs p-3 flex flex-col min-h-[320px] overflow-hidden">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#0F172A]">Pratinjau Dokumen Asli</p>
                  {fileUrl?.url && (
                    <a
                      href={fileUrl.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                    >
                      Buka di tab baru
                    </a>
                  )}
                </div>
                {fileLoading ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2">
                    <div className="h-7 w-7 animate-spin rounded-full border-3 border-[#24215E] border-t-transparent" />
                    <p className="text-xs text-[#475569]">Memuat berkas asli...</p>
                  </div>
                ) : fileError ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                    <span className="material-symbols-outlined text-[34px] text-[#B91C1C]">error</span>
                    <p className="text-sm font-semibold text-[#B91C1C]">Berkas asli tidak dapat ditampilkan</p>
                    <p className="text-xs text-[#475569] max-w-xs break-all">{fileError}</p>
                    <code className="mt-1 text-[10px] text-[#64748B] break-all max-w-full">{invoice.file_key}</code>
                  </div>
                ) : fileUrl?.mime_type.startsWith("image/") ? (
                  <div className="flex flex-1 min-h-0 items-center justify-center bg-[#F8FAFC] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not served through the Next image optimizer */}
                    <img
                      src={fileUrl.url}
                      alt={`Berkas asli ${fileUrl.original_filename}`}
                      className="h-auto w-auto max-h-[300px] max-w-full object-contain rounded bg-white shadow-sm"
                    />
                  </div>
                ) : fileUrl ? (
                  <iframe
                    src={fileUrl.url}
                    title={`Berkas asli ${fileUrl.original_filename}`}
                    className="h-[320px] w-full flex-1 rounded border-0 bg-white"
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                    <span className="material-symbols-outlined text-[#94A3B8] text-[56px]">picture_as_pdf</span>
                    <p className="text-sm font-semibold text-[#0F172A]">Pratinjau Dokumen Asli</p>
                    <p className="text-xs text-[#475569] max-w-xs">URL berkas asli belum tersedia.</p>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center">
                  <span className="px-3 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded font-mono text-[11px] text-[#1E3A8A]">
                    {invoice.original_filename}
                  </span>
                  <code className="text-[10px] text-[#64748B] break-all max-w-full">{invoice.file_key}</code>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs p-4 space-y-3">
                <h3 className="font-bold text-sm text-[#0F172A] pb-1 border-b border-[#F1F5F9]">Hasil Ekstraksi & Koreksi Field</h3>
                <Field label="Nomor Invoice" value={invoiceNumber} onChange={setInvoiceNumber} disabled={isFinal} />
                <Field label="Nama Vendor" value={vendorName} onChange={setVendorName} disabled={isFinal} />
                <Field label="Nomor Rekening" value={bankAccount} onChange={setBankAccount} disabled={isFinal} />
                <Field label="Total Tagihan" value={totalAmount} onChange={setTotalAmount} disabled={isFinal} />
                <div className="text-xs text-[#475569]">Optimistic locking: v{invoice.version} • status {invoice.status}</div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCorrect()}
                    disabled={saving || isFinal}
                    className="px-3 py-1.5 rounded bg-[#1E3A8A] text-white text-xs font-semibold disabled:bg-[#CBD5E1]"
                  >
                    {saving ? "Menyimpan..." : "Simpan Koreksi"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprove()}
                    disabled={saving || isFinal}
                    className="px-4 py-1.5 rounded bg-[#166534] text-white text-xs font-semibold disabled:bg-[#CBD5E1]"
                  >
                    Setujui
                  </button>
                </div>

                {!isFinal && (
                  <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                    <label className="block text-xs font-medium text-[#475569]">Catatan Penolakan (wajib)</label>
                    <textarea
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      rows={3}
                      className="w-full px-2.5 py-2 rounded border border-[#CBD5E1] text-xs outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleReject()}
                      disabled={saving}
                      className="px-4 py-1.5 rounded bg-[#B91C1C] text-white text-xs font-semibold disabled:bg-[#CBD5E1]"
                    >
                      Tolak Dokumen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {invoice && isFinal && (
            <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs p-4 space-y-3">
              <h3 className="font-bold text-sm text-[#0F172A] pb-1 border-b border-[#F1F5F9]">Keputusan Review Final</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#475569]">Status</span>
                  <span className="font-semibold">{invoice.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#475569]">Reviewer</span>
                  <span className="font-semibold">{invoice.reviewed_by_name || invoice.reviewed_by}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#475569]">Versi</span>
                  <span className="font-mono">v{invoice.version}</span>
                </div>
                {invoice.reject_note && (
                  <div className="pt-2 border-t border-[#F1F5F9]">
                    <span className="block text-[#475569] font-medium mb-1">Catatan Penolakan</span>
                    <p className="text-[#991B1B] bg-[#FEE2E2] border border-[#FCA5A5] rounded p-2">{invoice.reject_note}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {audit.length > 0 && (
            <div className="bg-white border border-[#CBD5E1] rounded-lg shadow-xs p-4">
              <h3 className="font-bold text-sm text-[#0F172A] mb-3">Audit Trail</h3>
              <ul className="space-y-2 text-xs">
                {audit.map((log) => (
                  <li key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 border-b border-[#F1F5F9] pb-2">
                    <span className="font-mono text-[10px] text-[#94A3B8]">{new Date(log.created_at).toLocaleString("id-ID")}</span>
                    <span className="font-semibold text-[#1E3A8A]">{log.action}</span>
                    <span className="text-[#475569]">{log.user_name}</span>
                    {log.new_value && <span className="text-[#0F172A] truncate max-w-[420px]">{log.new_value}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    />
  );
}

export default function ReviewerDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
          <div className="w-8 h-8 border-3 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ReviewerDetailContent />
    </Suspense>
  );
}

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div>
      <label className="block text-[#475569] font-medium mb-0.5 text-xs">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-8 px-2.5 rounded border border-[#CBD5E1] font-mono text-xs disabled:bg-[#F1F5F9]"
      />
    </div>
  );
}