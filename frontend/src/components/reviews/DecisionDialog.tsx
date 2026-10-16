"use client";

import { useEffect, useState } from "react";

export const NOTE_MIN = 10;
export const NOTE_MAX = 500;

export type DecisionKind = "approve" | "reject";

const COPY: Record<DecisionKind, { title: string; icon: string; tone: string; confirm: string; label: string; placeholder: string }> = {
  approve: {
    title: "Setujui Dokumen",
    icon: "verified",
    tone: "bg-success-subtle text-success",
    confirm: "Setujui dokumen",
    label: "Catatan justifikasi",
    placeholder: "Contoh: Invoice berbeda periode tagihan, sudah dikonfirmasi ke vendor melalui email.",
  },
  reject: {
    title: "Tolak Dokumen",
    icon: "gavel",
    tone: "bg-danger-subtle text-danger",
    confirm: "Tolak dokumen",
    label: "Catatan penolakan",
    placeholder: "Tuliskan alasan penolakan secara spesifik untuk staf Intake...",
  },
};

/**
 * Confirmation dialog for UC-8. Rejection always needs a note; approval needs one only for
 * POSSIBLE_DUPLICATE (`noteRequired`). The backend re-validates the note (10-500 characters).
 */
export default function DecisionDialog({
  kind,
  requestId,
  noteRequired,
  context,
  error,
  busy,
  onConfirm,
  onClose,
}: {
  kind: DecisionKind;
  requestId: string;
  noteRequired: boolean;
  /** Extra warning shown above the note, e.g. the duplicate finding or unsaved edits. */
  context?: string[];
  error: string | null;
  busy: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const copy = COPY[kind];
  const [note, setNote] = useState("");
  const length = note.trim().length;
  const tooShort = noteRequired && length < NOTE_MIN;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-dialog-title"
        className="w-full max-w-modal-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-full p-2 ${copy.tone}`}>
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">{copy.icon}</span>
          </div>
          <div>
            <h3 id="decision-dialog-title" className="text-base font-bold">
              {copy.title} <span className="font-mono">{requestId}</span>
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              {kind === "reject"
                ? "Penolakan bersifat final. Intake akan mengunggah ulang sebagai request baru."
                : "Status berubah menjadi AMIGA_REVIEWED dan invoice siap dibuatkan voucher. Persetujuan tidak dapat dibatalkan."}
            </p>
          </div>
        </div>

        {context?.map((line) => (
          <p key={line} className="flex items-start gap-2 rounded border border-status-exception-border bg-warning-subtle px-3 py-2 text-xs text-warning">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">warning</span>
            {line}
          </p>
        ))}

        {/* Rejection always has a required note; a plain approval offers an optional one. */}
        <div className="space-y-1.5">
          <label htmlFor="decision-note" className="block text-xs font-semibold text-text-primary">
            {copy.label} {noteRequired ? <span className="text-danger">*</span> : <span className="font-normal text-text-secondary">(opsional)</span>}
          </label>
          <textarea
            id="decision-note"
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={NOTE_MAX}
            rows={4}
            placeholder={copy.placeholder}
            aria-invalid={Boolean(error)}
            className={`w-full rounded border bg-white p-2.5 text-sm focus:ring-2 focus:ring-focus-ring ${error ? "border-danger" : "border-border-strong"}`}
          />
          <div className="flex justify-between text-[11px]">
            <span className="font-medium text-danger">{error}</span>
            <span className={tooShort ? "text-text-disabled" : "text-text-secondary"}>
              {length}/{NOTE_MAX}
              {noteRequired && ` (min. ${NOTE_MIN})`}
            </span>
          </div>
          <p className="text-[11px] text-text-secondary">Catatan dicatat di riwayat perubahan dan terlihat oleh Intake.</p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-muted pt-3">
          <button type="button" disabled={busy} onClick={onClose} className="h-9 rounded px-3.5 text-xs font-semibold text-text-secondary hover:bg-surface-muted">
            Batal
          </button>
          <button
            type="button"
            disabled={busy || tooShort}
            onClick={() => onConfirm(note.trim())}
            className={`flex h-9 items-center gap-1.5 rounded px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              kind === "reject" ? "bg-danger hover:bg-status-rejected-fg" : "bg-success hover:opacity-90"
            }`}
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {copy.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
