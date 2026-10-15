"use client";

import { useEffect, useState } from "react";
import { InvoiceFileUrl, invoiceService } from "@/lib/api";
import { formatBytes } from "@/lib/format";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];

/**
 * "Lihat file asli" (view original file) modal (REV-08). A presigned URL is requested
 * every time the modal opens because it is short-lived; viewing is not audited (AUD-01).
 */
export default function FileViewerModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [file, setFile] = useState<InvoiceFileUrl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    let cancelled = false;
    invoiceService
      .fileUrl(invoiceId)
      .then((result) => !cancelled && setFile(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Berkas asli tidak dapat dimuat."));
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isImage = file?.mime_type.startsWith("image/");
  const stepZoom = (direction: 1 | -1) => {
    const index = ZOOM_STEPS.indexOf(zoom);
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))]);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-2 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-viewer-title"
        className="flex h-full max-h-[920px] w-full max-w-modal-lg flex-col overflow-hidden rounded-lg bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="material-symbols-outlined text-[22px] text-danger">
              {isImage ? "image" : "picture_as_pdf"}
            </span>
            <div className="min-w-0">
              <h4 id="file-viewer-title" className="truncate text-sm font-semibold">
                {file?.original_filename ?? "Memuat berkas..."}
              </h4>
              {file && (
                <p className="text-[11px] text-text-secondary">
                  Ukuran: {formatBytes(file.file_size)} • File Asli Terverifikasi
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isImage && (
              <div className="mr-2 flex items-center gap-0.5 rounded border border-border p-0.5">
                <button type="button" title="Perkecil" onClick={() => stepZoom(-1)} className="rounded p-1 text-text-secondary hover:bg-surface-muted">
                  <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                </button>
                <span className="w-12 text-center font-mono text-xs">{zoom}%</span>
                <button type="button" title="Perbesar" onClick={() => stepZoom(1)} className="rounded p-1 text-text-secondary hover:bg-surface-muted">
                  <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                </button>
                <button type="button" title="Reset Zoom" onClick={() => setZoom(100)} className="rounded p-1 text-text-secondary hover:bg-surface-muted">
                  <span className="material-symbols-outlined text-[18px]">fit_screen</span>
                </button>
              </div>
            )}
            <button type="button" aria-label="Tutup jendela pratinjau" onClick={onClose} className="rounded p-1.5 text-text-secondary hover:bg-surface-muted">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-surface-sunken">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-status-rejected-fg">
              <span aria-hidden="true" className="material-symbols-outlined text-[32px]">cloud_off</span>
              <p className="text-sm font-semibold">Berkas asli tidak dapat ditampilkan</p>
              <p className="text-xs">{error}</p>
            </div>
          ) : !file ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            </div>
          ) : isImage ? (
            <div className="flex min-h-full items-start justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not served through the Next image optimizer */}
              <img
                src={file.url}
                alt={`Berkas asli ${file.original_filename}`}
                style={{ width: `${zoom}%`, maxWidth: "none" }}
                className="h-auto bg-white shadow-md"
              />
            </div>
          ) : (
            <iframe src={file.url} title={`Berkas asli ${file.original_filename}`} className="h-full w-full border-0 bg-white" />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-2.5">
          <p className="text-[11px] text-text-secondary">Dokumen read-only. Tautan akses berlaku sementara.</p>
          <button type="button" onClick={onClose} className="h-8 rounded border border-border bg-surface px-3 text-xs font-semibold hover:bg-surface-muted">
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </div>
  );
}
