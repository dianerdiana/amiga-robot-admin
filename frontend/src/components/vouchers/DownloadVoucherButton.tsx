"use client";

import { useState } from "react";
import { VoucherDetail, VoucherStatus, errorStatus, startDownload, voucherService } from "@/lib/api";

/**
 * Unduh voucher PDF (UC-9). The backend checks client access, records the download, and on the
 * first download moves the voucher and its invoices to SENT_TO_CLIENT (VCH-12).
 */
export default function DownloadVoucherButton({
  voucherId,
  status,
  onDownloaded,
  compact = false,
}: {
  voucherId: string;
  status: VoucherStatus;
  onDownloaded?: (voucher: VoucherDetail) => void;
  /** Icon-sized button for table rows; the error then shows as a tooltip-style line below. */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = status === "CREATED";
  const label = first ? "Unduh PDF" : "Unduh ulang";

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await voucherService.download(voucherId);
      onDownloaded?.(result.voucher);
      startDownload(result.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Berkas voucher tidak dapat diambil, coba lagi.";
      setError(errorStatus(err) === 403 ? `Akses ditolak. ${message}` : message);
    } finally {
      setBusy(false);
    }
  };

  const icon = busy ? (
    <span className={`animate-spin rounded-full border-2 border-t-transparent ${compact ? "h-3.5 w-3.5 border-primary" : "h-4 w-4 border-white"}`} />
  ) : (
    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
  );

  return (
    <div className={`flex flex-col ${compact ? "items-end" : "items-stretch sm:items-end"} gap-1`}>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        title={first ? "Unduhan pertama mengubah status menjadi SENT_TO_CLIENT" : undefined}
        className={
          compact
            ? "inline-flex h-8 items-center gap-1 rounded border border-border bg-surface px-2.5 text-xs font-semibold text-primary hover:border-primary hover:bg-primary-subtle disabled:opacity-60"
            : "flex h-10 items-center justify-center gap-1.5 rounded bg-primary px-5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
        }
      >
        {icon}
        {label}
      </button>
      {!compact && first && !error && (
        <p className="text-[11px] text-text-secondary">Unduhan pertama mengubah status menjadi SENT_TO_CLIENT.</p>
      )}
      {error && (
        <p role="alert" className={`text-[11px] font-medium text-danger ${compact ? "max-w-[220px] text-right" : ""}`}>
          {error}
        </p>
      )}
    </div>
  );
}
