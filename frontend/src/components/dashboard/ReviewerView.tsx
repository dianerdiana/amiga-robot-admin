"use client";

import React, { useState } from "react";

interface ReviewItem {
  id: string;
  requestId: string;
  clientName: string;
  vendorName: string;
  invoiceNumber: string;
  accountNumber: string;
  totalAmount: string;
  status: "READY_FOR_REVIEW" | "EXCEPTION";
  exceptionCode?: string;
}

const SAMPLE_REVIEWS: ReviewItem[] = [
  {
    id: "1",
    requestId: "REQ-2026-000101",
    clientName: "PT Sentosa Abadi (Klien A)",
    vendorName: "PT Vendor Solusi Prima",
    invoiceNumber: "INV-2026-9081",
    accountNumber: "BCA 8901234567",
    totalAmount: "Rp 14.500.000",
    status: "READY_FOR_REVIEW",
  },
  {
    id: "3",
    requestId: "REQ-2026-000103",
    clientName: "PT Sentosa Abadi (Klien A)",
    vendorName: "PT Mitra Logistik Jaya",
    invoiceNumber: "INV-2026-9083",
    accountNumber: "Tidak terdeteksi (MISSING_EVIDENCE)",
    totalAmount: "Rp 3.120.000",
    status: "EXCEPTION",
    exceptionCode: "MISSING_EVIDENCE",
  },
];

interface ReviewerViewProps {
  activeTab: string;
}

export default function ReviewerView({ activeTab }: ReviewerViewProps) {
  const [selectedReview, setSelectedReview] = useState<ReviewItem | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleAction = (type: "approve" | "reject", item: ReviewItem) => {
    if (type === "approve") {
      setActionSuccess(
        `Invoice ${item.invoiceNumber} berhasil disetujui (Status diubah ke AMIGA_REVIEWED).`
      );
    } else {
      setActionSuccess(
        `Invoice ${item.invoiceNumber} telah ditolak dengan catatan penolakan wajib.`
      );
    }
    setTimeout(() => setActionSuccess(null), 4000);
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#475569]">
        <span className="hover:text-[#0F172A] transition-colors">
          Konsol Finance Reviewer
        </span>
        <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">
          chevron_right
        </span>
        <span className="font-semibold text-[#0F172A]">
          {activeTab === "riwayat" ? "Riwayat Persetujuan" : "Antrean Review"}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#DCFCE7] text-[#166534] flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">
              fact_check
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Pemeriksaan &amp; Persetujuan Keuangan
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
              Reviewer independen memeriksa hasil ekstraksi AI secara split-screen, koreksi field, setujui atau tolak invoice.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-[#CBD5E1] shadow-xs text-xs">
          <span className="px-3 py-1 bg-[#CCFBF1] text-[#115E59] font-bold rounded">
            5 Siap Review
          </span>
          <span className="px-3 py-1 bg-[#FEF3C7] text-[#92400E] font-bold rounded">
            2 Perlu Koreksi
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-lg bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">
            check_circle
          </span>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Review Queue Table */}
      <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[#CBD5E1] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0F172A]">
            Antrean Review Invoice Masuk (Hanya Klien Ditugaskan)
          </h2>
          <span className="text-xs font-semibold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded">
            Segregation of Duties Aktif
          </span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-9 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                <th className="px-4 py-2">REQUEST ID</th>
                <th className="px-4 py-2">KLIEN</th>
                <th className="px-4 py-2">VENDOR &amp; INVOICE</th>
                <th className="px-4 py-2">REKENING BANK</th>
                <th className="px-4 py-2">NOMINAL</th>
                <th className="px-4 py-2">STATUS VALIDASI</th>
                <th className="px-4 py-2 text-right">AKSI REVIEW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {SAMPLE_REVIEWS.map((rev) => (
                <tr key={rev.id} className="h-12 hover:bg-[#F8FAFC]">
                  <td className="px-4 py-2 font-mono font-semibold text-[#1E3A8A]">
                    {rev.requestId}
                  </td>
                  <td className="px-4 py-2 text-[#0F172A]">{rev.clientName}</td>
                  <td className="px-4 py-2">
                    <div className="font-semibold text-[#0F172A]">{rev.vendorName}</div>
                    <div className="text-[11px] font-mono text-[#94A3B8]">
                      {rev.invoiceNumber}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`font-mono text-[11px] ${
                        rev.exceptionCode
                          ? "text-[#B91C1C] font-bold"
                          : "text-[#475569]"
                      }`}
                    >
                      {rev.accountNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono font-bold text-[#0F172A]">
                    {rev.totalAmount}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        rev.status === "READY_FOR_REVIEW"
                          ? "bg-[#CCFBF1] text-[#115E59] border-[#5EEAD4]"
                          : "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]"
                      }`}
                    >
                      {rev.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedReview(rev)}
                        className="px-2.5 py-1 bg-[#1E3A8A] text-white rounded text-[11px] font-semibold hover:bg-[#1B3380] flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          splitscreen
                        </span>
                        <span>Periksa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction("approve", rev)}
                        className="p-1 rounded bg-[#DCFCE7] text-[#166534] hover:bg-[#BBF7D0]"
                        title="Setujui Langsung (AMIGA_REVIEWED)"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          check
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction("reject", rev)}
                        className="p-1 rounded bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]"
                        title="Tolak Dokumen"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          close
                        </span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Split Screen Modal Demo */}
      {selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-[#1E3A8A] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">
                  splitscreen
                </span>
                <span className="font-semibold text-sm">
                  Layar Review Split-Screen: {selectedReview.invoiceNumber} ({selectedReview.requestId})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReview(null)}
                className="text-white/80 hover:text-white"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#CBD5E1] flex-1 overflow-y-auto text-xs p-4 gap-4">
              {/* Left Side: Original PDF/Image viewer */}
              <div className="flex flex-col items-center justify-center p-6 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
                <span className="material-symbols-outlined text-[48px] text-[#94A3B8] mb-2">
                  picture_as_pdf
                </span>
                <p className="font-semibold text-sm text-[#0F172A]">
                  Pratinjau Dokumen Asli
                </p>
                <p className="text-[11px] text-[#94A3B8] text-center mt-1">
                  Presigned URL berumur 5 menit via Amazon S3 Private Bucket
                </p>
                <span className="mt-3 px-3 py-1 bg-white border border-[#CBD5E1] rounded font-mono text-[11px] text-[#1E3A8A]">
                  {selectedReview.vendorName}.pdf
                </span>
              </div>

              {/* Right Side: Editable fields & AI Extracted Data */}
              <div className="space-y-3">
                <h3 className="font-bold text-sm text-[#0F172A] pb-1 border-b border-[#F1F5F9]">
                  Hasil Ekstraksi AI Bedrock &amp; Koreksi Field
                </h3>
                <div>
                  <label className="block text-[#475569] font-medium mb-0.5">
                    Nomor Invoice
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedReview.invoiceNumber}
                    className="w-full h-8 px-2.5 rounded border border-[#CBD5E1] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#475569] font-medium mb-0.5">
                    Nama Vendor
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedReview.vendorName}
                    className="w-full h-8 px-2.5 rounded border border-[#CBD5E1]"
                  />
                </div>
                <div>
                  <label className="block text-[#475569] font-medium mb-0.5">
                    Nomor Rekening Bank
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedReview.accountNumber}
                    className="w-full h-8 px-2.5 rounded border border-[#CBD5E1] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#475569] font-medium mb-0.5">
                    Total Tagihan
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedReview.totalAmount}
                    className="w-full h-8 px-2.5 rounded border border-[#CBD5E1] font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#CBD5E1] flex items-center justify-between">
              <span className="text-[11px] text-[#475569]">
                Optimistic Locking Version: #1
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleAction("reject", selectedReview);
                    setSelectedReview(null);
                  }}
                  className="px-3 py-1.5 rounded bg-[#FEE2E2] text-[#991B1B] font-semibold text-xs hover:bg-[#FECACA]"
                >
                  Tolak Dokumen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleAction("approve", selectedReview);
                    setSelectedReview(null);
                  }}
                  className="px-4 py-1.5 rounded bg-[#166534] text-white font-semibold text-xs hover:bg-[#14532D]"
                >
                  Setujui (AMIGA_REVIEWED)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
