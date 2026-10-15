"use client";

import React, { useState } from "react";

interface InvoiceItem {
  id: string;
  requestId: string;
  clientName: string;
  vendorName: string;
  invoiceNumber: string;
  amount: string;
  status:
    | "QUEUED"
    | "PROCESSING"
    | "READY_FOR_REVIEW"
    | "EXCEPTION"
    | "AMIGA_REVIEWED"
    | "VOUCHERED";
  statusColor: string;
  hasEyeIcon: boolean;
}

const SAMPLE_INVOICES: InvoiceItem[] = [
  {
    id: "1",
    requestId: "REQ-2026-000101",
    clientName: "PT Sentosa Abadi (Klien A)",
    vendorName: "PT Vendor Solusi Prima",
    invoiceNumber: "INV-2026-9081",
    amount: "Rp 14.500.000",
    status: "READY_FOR_REVIEW",
    statusColor: "bg-[#CCFBF1] text-[#115E59] border-[#5EEAD4]",
    hasEyeIcon: true,
  },
  {
    id: "2",
    requestId: "REQ-2026-000102",
    clientName: "PT Bintang Timur (Klien B)",
    vendorName: "CV Maju Jaya Distribusi",
    invoiceNumber: "INV-2026-9082",
    amount: "Rp 8.250.000",
    status: "AMIGA_REVIEWED",
    statusColor: "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]",
    hasEyeIcon: true,
  },
  {
    id: "3",
    requestId: "REQ-2026-000103",
    clientName: "PT Sentosa Abadi (Klien A)",
    vendorName: "PT Mitra Logistik Jaya",
    invoiceNumber: "INV-2026-9083",
    amount: "Rp 3.120.000",
    status: "EXCEPTION",
    statusColor: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
    hasEyeIcon: true,
  },
  {
    id: "4",
    requestId: "REQ-2026-000104",
    clientName: "PT Sentosa Abadi (Klien A)",
    vendorName: "PT Vendor Solusi Prima",
    invoiceNumber: "INV-2026-9084",
    amount: "Rp 21.000.000",
    status: "AMIGA_REVIEWED",
    statusColor: "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]",
    hasEyeIcon: true,
  },
];

interface IntakeViewProps {
  activeTab: string;
}

export default function IntakeView({ activeTab }: IntakeViewProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  return (
    <div className="flex flex-col w-full pb-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#475569]">
        <span className="hover:text-[#0F172A] transition-colors">Konsol Intake</span>
        <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">
          chevron_right
        </span>
        <span className="font-semibold text-[#0F172A]">
          {activeTab === "upload"
            ? "Unggah Invoice"
            : activeTab === "vouchers"
            ? "Daftar Voucher"
            : activeTab === "buat-voucher"
            ? "Buat Voucher"
            : "Antrean Invoice"}
        </span>
      </nav>

      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#E0E7FF] text-[#1E3A8A] flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">
              receipt_long
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Operasional Intake Internal
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
              Unggah invoice masuk dari klien yang ditugaskan, pantau ekstraksi AI, dan buat voucher pembayaran.
            </p>
          </div>
        </div>

        {/* Counter Summary */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-white rounded-lg border border-[#CBD5E1] shadow-xs text-center shrink-0">
          <div className="px-3 py-1.5 border-r border-[#F1F5F9]">
            <span className="block text-[11px] text-[#475569]">Antrean</span>
            <span className="text-lg font-bold text-[#0F172A] font-mono">12</span>
          </div>
          <div className="px-3 py-1.5 border-r border-[#F1F5F9]">
            <span className="block text-[11px] text-[#166534]">Approved</span>
            <span className="text-lg font-bold text-[#166534] font-mono">6</span>
          </div>
          <div className="px-3 py-1.5">
            <span className="block text-[11px] text-[#92400E]">Exception</span>
            <span className="text-lg font-bold text-[#92400E] font-mono">2</span>
          </div>
        </div>
      </div>

      {/* Tab Specific Content */}
      {activeTab === "upload" ? (
        <div className="bg-white border border-[#CBD5E1] rounded-lg p-6 shadow-xs max-w-2xl">
          <h2 className="text-base font-bold text-[#0F172A] mb-1">
            Form Unggah Dokumen Invoice (UPL-01)
          </h2>
          <p className="text-xs text-[#475569] mb-4">
            Menerima file PDF, JPG, PNG (Maks 10 MB per file). Draf hasil ekstraksi akan diproses otomatis oleh Bedrock AI.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setUploadSuccess(true);
              setTimeout(() => setUploadSuccess(false), 4000);
            }}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="block text-[#475569] font-medium mb-1">
                Klien (Hanya Klien yang Ditugaskan)
              </label>
              <select className="w-full h-9 px-3 rounded border border-[#CBD5E1] outline-none focus:ring-2 focus:ring-[#2563EB]">
                <option>PT Sentosa Abadi (Klien A)</option>
                <option>PT Bintang Timur (Klien B)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Saluran Masuk
                </label>
                <select className="w-full h-9 px-3 rounded border border-[#CBD5E1] outline-none">
                  <option>WhatsApp</option>
                  <option>Email</option>
                  <option>Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-[#475569] font-medium mb-1">
                  Tanggal Permintaan
                </label>
                <input
                  type="date"
                  defaultValue="2026-10-15"
                  className="w-full h-9 px-3 rounded border border-[#CBD5E1] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#475569] font-medium mb-1">
                File Invoice (PDF, JPG, PNG)
              </label>
              <div className="border-2 border-dashed border-[#CBD5E1] rounded-lg p-6 text-center hover:bg-[#F8FAFC] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[36px] text-[#1E3A8A] mb-1">
                  cloud_upload
                </span>
                <p className="text-xs font-semibold text-[#0F172A]">
                  Tarik file ke sini atau klik untuk memilih file
                </p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  Maksimal 10 MB per request. S3 Key otomatis clients/{`{client_id}`}/invoices/
                </p>
              </div>
            </div>

            {uploadSuccess && (
              <div className="p-3 rounded bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>Unggahan berhasil! Request ID: <b>REQ-2026-000105</b> diterbitkan dalam 3 detik (Status: QUEUED).</span>
              </div>
            )}

            <button
              type="submit"
              className="px-5 py-2.5 bg-[#1E3A8A] text-white rounded font-semibold text-xs hover:bg-[#1B3380] transition-colors"
            >
              Kirim &amp; Proses Ekstraksi AI
            </button>
          </form>
        </div>
      ) : activeTab === "buat-voucher" || activeTab === "vouchers" ? (
        <div className="bg-white border border-[#CBD5E1] rounded-lg p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#CBD5E1] mb-4">
            <div>
              <h2 className="text-base font-bold text-[#0F172A]">
                Penyusunan Voucher Pembayaran (VCH-01)
              </h2>
              <p className="text-xs text-[#475569]">
                Pilih invoice berstatus AMIGA_REVIEWED untuk satu klien, vendor, dan rekening bank yang sama.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-[#E0E7FF] text-[#1E3A8A] text-xs font-semibold">
              Format: VCH-2026-00001
            </span>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-9 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                  <th className="px-3 py-2 w-10">Pilih</th>
                  <th className="px-3 py-2">No. Invoice</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Klien</th>
                  <th className="px-3 py-2">Nominal</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {SAMPLE_INVOICES.filter((i) => i.status === "AMIGA_REVIEWED").map(
                  (inv) => (
                    <tr key={inv.id} className="h-11 hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-[#0F172A]">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-3 py-2 text-[#475569]">{inv.vendorName}</td>
                      <td className="px-3 py-2 text-[#475569]">{inv.clientName}</td>
                      <td className="px-3 py-2 font-mono font-bold text-[#166534]">
                        {inv.amount}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-[#DCFCE7] text-[#166534] border-[#86EFAC]">
                          AMIGA_REVIEWED
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="p-1 rounded text-[#1E3A8A] hover:bg-[#E0E7FF]"
                          title="Lihat Dokumen Asli (Presigned URL)"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            visibility
                          </span>
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-[#CBD5E1] flex items-center justify-between">
            <div className="text-xs text-[#475569]">
              Total Pilihan: <b>2 Invoice</b> | Akumulasi: <b className="text-[#166534] font-mono">Rp 29.250.000</b>
            </div>
            <button
              type="button"
              className="px-4 py-2 bg-[#1E3A8A] text-white rounded font-semibold text-xs hover:bg-[#1B3380]"
            >
              Simpan &amp; Buat Voucher Atomik
            </button>
          </div>
        </div>
      ) : (
        /* Default: Antrean Invoice */
        <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-[#CBD5E1] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A]">
              Daftar Antrean &amp; Status Dokumen Invoice
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#475569]">Filter:</span>
              <select className="h-8 px-2 rounded border border-[#CBD5E1] text-xs outline-none">
                <option>Semua Status</option>
                <option>READY_FOR_REVIEW</option>
                <option>AMIGA_REVIEWED</option>
                <option>EXCEPTION</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-9 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                  <th className="px-4 py-2">REQUEST ID</th>
                  <th className="px-4 py-2">KLIEN</th>
                  <th className="px-4 py-2">VENDOR &amp; NO. INVOICE</th>
                  <th className="px-4 py-2">NOMINAL</th>
                  <th className="px-4 py-2">STATUS EKSTRAKSI</th>
                  <th className="px-4 py-2 text-right">FILE ASLI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {SAMPLE_INVOICES.map((inv) => (
                  <tr key={inv.id} className="h-12 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2 font-mono font-semibold text-[#1E3A8A]">
                      {inv.requestId}
                    </td>
                    <td className="px-4 py-2 text-[#0F172A]">{inv.clientName}</td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-[#0F172A]">{inv.vendorName}</div>
                      <div className="text-[11px] font-mono text-[#94A3B8]">
                        {inv.invoiceNumber}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono font-bold text-[#0F172A]">
                      {inv.amount}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${inv.statusColor}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="p-1.5 rounded text-[#1E3A8A] hover:bg-[#E0E7FF] transition-colors"
                        title="Buka file asli di modal (presigned URL)"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          visibility
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
