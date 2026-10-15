"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function ReviewerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { user, isLoading } = useAuth();

  const [invoice, setInvoice] = useState<ReviewInvoice | null>(null);
  const [audit, setAudit] = useState<ReviewAuditLog[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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
            <span className="font-semibold text-[#0F172A]">Periksa Invoice</span>
          </nav>
          {isFetching && <div className="text-xs text-[#475569]">Memuat data invoice...</div>}
          {error && <div className="p-3 rounded bg-[#FEE2E2] border border-[#B91C1C] text-[#991B1B] text-xs">{error}</div>}
          {actionMessage && <div className="p-3 rounded bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs">{actionMessage}</div>}

          {invoice && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs p-4 flex flex-col items-center justify-center min-h-[320px]">
                <span className="material-symbols-outlined text-[#94A3B8] text-[64px] mb-2">picture_as_pdf</span>
                <p className="text-sm font-semibold text-[#0F172A]">Pratinjau Dokumen Asli</p>
                <p className="text-[11px] text-[#94A3B8] text-center mt-1">Presigned URL S3 (placeholder)</p>
                <span className="mt-3 px-3 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded font-mono text-[11px] text-[#1E3A8A]">
                  {invoice.original_filename}
                </span>
                <code className="mt-2 text-[10px] text-[#64748B] break-all max-w-full">{invoice.file_key}</code>
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