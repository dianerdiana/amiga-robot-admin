"use client";

import React, { useState } from "react";

interface ClientReviewerAssignment {
  clientId: string;
  clientName: string;
  clientCode: string;
  activeReviewers: string[];
  pendingInvoicesCount: number;
}

const INITIAL_ASSIGNMENTS: ClientReviewerAssignment[] = [
  {
    clientId: "c1",
    clientName: "PT Sentosa Abadi",
    clientCode: "CLN-001",
    activeReviewers: ["Ahmad Hidayat", "Eka Putri"],
    pendingInvoicesCount: 5,
  },
  {
    clientId: "c2",
    clientName: "PT Bintang Timur",
    clientCode: "CLN-002",
    activeReviewers: ["Eka Putri"],
    pendingInvoicesCount: 3,
  },
  {
    clientId: "c3",
    clientName: "CV Cemerlang Kreasi",
    clientCode: "CLN-003",
    activeReviewers: [], // No reviewer assigned! Trigger ACC-06 & ADM-03 indicator
    pendingInvoicesCount: 2,
  },
];

interface ServiceLeadViewProps {
  activeTab: string;
}

export default function ServiceLeadView({ activeTab }: ServiceLeadViewProps) {
  const [assignments, setAssignments] =
    useState<ClientReviewerAssignment[]>(INITIAL_ASSIGNMENTS);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAssignSample = (clientId: string) => {
    setAssignments((prev) =>
      prev.map((c) =>
        c.clientId === clientId
          ? { ...c, activeReviewers: [...c.activeReviewers, "Ahmad Hidayat"] }
          : c
      )
    );
    setFeedback("Reviewer berhasil ditugaskan ke klien. Perubahan dicatat di audit trail.");
    setTimeout(() => setFeedback(null), 3500);
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#475569]">
        <span className="hover:text-[#0F172A] transition-colors">
          Konsol Service Lead
        </span>
        <span className="material-symbols-outlined text-[14px] text-[#94A3B8]">
          chevron_right
        </span>
        <span className="font-semibold text-[#0F172A]">
          {activeTab === "klien-reviewer"
            ? "Daftar Klien & Reviewer"
            : "Penugasan Reviewer"}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-[#FEF3C7] text-[#92400E] flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">
              supervisor_account
            </span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Manajemen Penugasan Reviewer (ADM-02)
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] mt-0.5">
              Tetapkan dan cabut reviewer per klien. Pengawasan antrean invoice dan deteksi klien tanpa reviewer aktif.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-[#CBD5E1] shadow-xs text-xs">
          <span className="px-3 py-1 bg-[#DCFCE7] text-[#166534] font-bold rounded">
            2 Klien Siap
          </span>
          <span className="px-3 py-1 bg-[#FEE2E2] text-[#991B1B] font-bold rounded">
            1 Belum Ada Reviewer
          </span>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">
            check_circle
          </span>
          <span>{feedback}</span>
        </div>
      )}

      {/* Assignment Table */}
      <div className="bg-white rounded-lg border border-[#CBD5E1] shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-[#CBD5E1] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#0F172A]">
            Matriks Penugasan Reviewer per Klien
          </h2>
          <span className="text-xs text-[#475569]">
            Total Klien: <b>{assignments.length}</b>
          </span>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-9 bg-[#F1F5F9] border-b border-[#CBD5E1]">
                <th className="px-4 py-2">KODE KLIEN</th>
                <th className="px-4 py-2">NAMA PERUSAHAAN KLIEN</th>
                <th className="px-4 py-2">REVIEWER AKTIF</th>
                <th className="px-4 py-2">STATUS PENUGASAN</th>
                <th className="px-4 py-2">INVOICE PENDING</th>
                <th className="px-4 py-2 text-right">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {assignments.map((cln) => {
                const hasNoReviewer = cln.activeReviewers.length === 0;
                return (
                  <tr key={cln.clientId} className="h-12 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2 font-mono font-semibold text-[#1E3A8A]">
                      {cln.clientCode}
                    </td>
                    <td className="px-4 py-2 font-semibold text-[#0F172A]">
                      {cln.clientName}
                    </td>
                    <td className="px-4 py-2">
                      {hasNoReviewer ? (
                        <span className="text-[#94A3B8] italic">
                          Belum ada reviewer ditugaskan
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {cln.activeReviewers.map((r, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded bg-[#E0E7FF] text-[#1E3A8A] font-semibold text-[11px]"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {hasNoReviewer ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]">
                          <span className="material-symbols-outlined text-[13px] mr-1">
                            warning
                          </span>
                          Belum ada reviewer
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]">
                          <span className="material-symbols-outlined text-[13px] mr-1">
                            check_circle
                          </span>
                          Tercakup Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono">
                      {cln.pendingInvoicesCount} dokumen
                    </td>
                    <td className="px-4 py-2 text-right">
                      {hasNoReviewer ? (
                        <button
                          type="button"
                          onClick={() => handleAssignSample(cln.clientId)}
                          className="px-2.5 py-1 bg-[#1E3A8A] text-white rounded font-semibold text-[11px] hover:bg-[#1B3380] transition-colors"
                        >
                          + Tetapkan Reviewer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAssignSample(cln.clientId)}
                          className="px-2.5 py-1 bg-white border border-[#CBD5E1] text-[#475569] rounded font-semibold text-[11px] hover:bg-[#F1F5F9] transition-colors"
                        >
                          Kelola Reviewer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
