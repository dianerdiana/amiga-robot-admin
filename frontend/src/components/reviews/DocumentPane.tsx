"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { InvoiceFileUrl, invoiceService } from "@/lib/api";
import { formatBytes } from "@/lib/format";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.2;
const ZOOM_STEP = 0.15;

/**
 * Left pane of the review split-screen (REV-01, REV-08): the original file through a short-lived
 * presigned URL. PDFs use the browser viewer; images get zoom and rotate for scans and photos.
 * Viewing is not audited (AUD-01).
 */
export default function DocumentPane({ invoiceId }: { invoiceId: string }) {
  const [file, setFile] = useState<InvoiceFileUrl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  // An image that fails to load gets one automatic URL refresh (it may have expired), not a loop.
  const autoRetried = useRef(false);

  /** Fetch a fresh presigned URL; state is only updated in promise callbacks. */
  const loadUrl = useCallback(
    () =>
      invoiceService.fileUrl(invoiceId).then(
        (result) => {
          setFile(result);
          setError(null);
        },
        (err) => setError(err instanceof Error ? err.message : "Berkas asli tidak dapat dimuat."),
      ),
    [invoiceId],
  );

  useEffect(() => {
    void loadUrl();
  }, [loadUrl]);

  const isImage = file?.mime_type.startsWith("image/") ?? false;
  const changeZoom = (delta: number) => setZoom((current) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(current + delta).toFixed(2))));
  const resetView = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <section aria-label="Berkas Dokumen Asli" className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-lg border border-border bg-surface-sunken shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 rounded border border-border bg-surface-muted px-2.5 py-1 font-mono text-[11px] text-text-secondary">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-danger">{isImage ? "image" : "picture_as_pdf"}</span>
          <span className="truncate" title={file?.original_filename}>{file?.original_filename ?? "Memuat berkas..."}</span>
          {file && <span className="shrink-0">• {formatBytes(file.file_size)}</span>}
        </div>
        <div className="flex items-center gap-1">
          {isImage && (
            <>
              <ToolButton icon="zoom_out" title="Perkecil" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} />
              <span className="w-12 text-center font-mono text-xs text-text-secondary">{Math.round(zoom * 100)}%</span>
              <ToolButton icon="zoom_in" title="Perbesar" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} />
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
              <ToolButton icon="fit_screen" title="Sesuaikan Lebar" onClick={resetView} />
              <ToolButton icon="rotate_right" title="Putar 90 Derajat" onClick={() => setRotation((current) => (current + 90) % 360)} />
            </>
          )}
          {/* The presigned URL is short-lived; reloading fetches a new one. */}
          <ToolButton icon="refresh" title="Muat ulang berkas" onClick={() => void loadUrl()} />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-status-rejected-fg">
            <span aria-hidden="true" className="material-symbols-outlined text-[32px]">cloud_off</span>
            <p className="text-sm font-semibold">Berkas asli tidak dapat ditampilkan</p>
            <p className="text-xs">{error}</p>
            <button type="button" onClick={() => void loadUrl()} className="mt-2 h-8 rounded border border-border bg-surface px-3 text-xs font-semibold text-text-primary hover:bg-surface-muted">
              Coba lagi
            </button>
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
              onLoad={() => {
                autoRetried.current = false;
              }}
              onError={() => {
                if (autoRetried.current) {
                  setError("Berkas gambar tidak dapat dimuat.");
                  return;
                }
                autoRetried.current = true;
                void loadUrl();
              }}
              style={{ width: `${zoom * 100}%`, maxWidth: "none", transform: `rotate(${rotation}deg)` }}
              className="h-auto origin-center bg-white shadow-md transition-transform duration-150"
            />
          </div>
        ) : (
          <iframe src={file.url} title={`Berkas asli ${file.original_filename}`} className="h-full w-full border-0 bg-white" />
        )}
      </div>
    </section>
  );
}

function ToolButton({ icon, title, onClick, disabled = false }: { icon: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
    </button>
  );
}
