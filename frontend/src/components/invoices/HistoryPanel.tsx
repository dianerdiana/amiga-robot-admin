"use client";

import { useState } from "react";
import { AuditEntry } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS } from "./meta";

/** Free-text notes (correction reason, decision notes) are shown as one full-width row. */
const NOTE_ROWS: Record<string, { label: string; row: string; text: string }> = {
  CORRECTION_NOTE: { label: "Alasan Koreksi", row: "bg-warning-subtle/60", text: "text-warning" },
  APPROVAL_NOTE: { label: "Catatan Persetujuan", row: "bg-success-subtle/60", text: "text-success" },
  REJECT_NOTE: { label: "Catatan Penolakan", row: "bg-danger-subtle/60", text: "text-status-rejected-fg" },
};

/** Collapsible change history (AUD-05); viewing is never audited. */
export default function HistoryPanel({ history }: { history: AuditEntry[] | null }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-muted sm:px-5"
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-primary">history_edu</span>
          <span>
            <span className="block text-sm font-semibold text-text-primary">Riwayat Perubahan & Audit Trail</span>
            <span className="block text-xs text-text-secondary">Rekaman perubahan data otomatis dan manual secara kronologis</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="hidden rounded bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary sm:inline">
            Hanya aksi mutasi dicatat
          </span>
          <span aria-hidden="true" className={`material-symbols-outlined transition-transform ${open ? "rotate-180" : ""}`}>expand_more</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border">
          <p className="flex items-center gap-1.5 bg-info-subtle px-4 py-2 text-[11px] text-info sm:px-5">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">info</span>
            Aktivitas membuka halaman dan melihat file asli tidak dicatat dalam riwayat.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="h-10 border-b border-border bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  {["Waktu", "Pengguna", "Aksi", "Field Target", "Nilai Lama", "Nilai Baru"].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-4">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {(history ?? []).map((entry) => {
                  const note = NOTE_ROWS[entry.action];
                  return note ? (
                    <tr key={entry.id} className={`h-11 ${note.row}`}>
                      <td className="whitespace-nowrap px-4 font-mono text-text-secondary">{formatDateTime(entry.created_at, true)}</td>
                      <td className="whitespace-nowrap px-4 font-medium">{entry.user.name}</td>
                      <td colSpan={4} className="px-4 py-2">
                        <span className={`font-semibold ${note.text}`}>{note.label}:</span>{" "}
                        <span className="italic text-text-primary">“{entry.new_value}”</span>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id} className="h-11">
                      <td className="whitespace-nowrap px-4 font-mono text-text-secondary">{formatDateTime(entry.created_at, true)}</td>
                      <td className="whitespace-nowrap px-4">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {entry.user.is_system && <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">smart_toy</span>}
                          {entry.user.name}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
                      <td className="whitespace-nowrap px-4 font-mono text-text-secondary">{entry.field_name ?? "-"}</td>
                      <td className="px-4">
                        <AuditValue value={entry.old_value} tone="old" />
                      </td>
                      <td className="px-4">
                        <AuditValue value={entry.new_value} tone="new" />
                      </td>
                    </tr>
                  );
                })}
                {history?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-text-disabled">Belum ada riwayat.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function AuditValue({ value, tone }: { value: string | null; tone: "old" | "new" }) {
  if (value === null || value === "") return <span className="text-text-disabled">-</span>;
  // The backend stores finding code lists comma-separated.
  const label = value.split(",").join(", ");
  return (
    <span
      className={`inline-block max-w-[260px] truncate rounded px-1.5 py-0.5 font-mono text-[11px] ${
        tone === "old" ? "bg-diff-old-bg text-diff-old-fg" : "bg-diff-new-bg text-diff-new-fg"
      }`}
      title={label}
    >
      {label}
    </span>
  );
}
