"use client";

import React from "react";

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

  return (
    <div className="flex flex-col w-full pb-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#475569]">
        <span className="hover:text-[#0F172A] transition-colors">Konsol Intake</span>
        <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">
          chevron_right
        </span>
        <span className="font-semibold text-[#0F172A]">
          {activeTab === "vouchers" ? "Daftar Voucher" : "Buat Voucher"}
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
      {/* The invoice queue and upload now live at /invoices and /invoices/upload. */}
      {(
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
      )}
    </div>
  );
}
