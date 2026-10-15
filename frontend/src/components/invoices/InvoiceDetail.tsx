"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuditEntry, InvoiceDetail as InvoiceDetailData, errorStatus, invoiceService } from "@/lib/api";
import { formatBytes, formatDate, formatDateTime, formatQuantity, formatRupiah } from "@/lib/format";
import FileViewerModal from "./FileViewerModal";
import { ErrorBanner, ForbiddenState, PageSpinner } from "./States";
import { IssueChip, StatusBadge } from "./StatusBadge";
import { AUDIT_ACTION_LABELS, CHANNEL_LABELS, EXTRACTION_FAILURE_CODES, isProcessing } from "./meta";

const POLL_INTERVAL_MS = 3000;

/** Read-only request detail for Intake (UC-5, UC-6), following templates/request-detail.html. */
export default function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [requeueing, setRequeueing] = useState(false);
  const [requeueError, setRequeueError] = useState<string | null>(null);

  /** Load detail and history; state is only updated in promise callbacks. */
  const load = useCallback(
    () =>
      Promise.all([invoiceService.get(invoiceId), invoiceService.history(invoiceId)]).then(
        ([detail, entries]) => {
          setInvoice(detail);
          setHistory(entries);
          setStatus("ready");
          setError(null);
        },
        (err) => {
          const code = errorStatus(err);
          if (code === 403) setStatus("forbidden");
          else if (code === 404 || code === 422) setStatus("missing");
          else {
            setStatus((current) => (current === "ready" ? current : "error"));
            setError(err instanceof Error ? err.message : "Detail request tidak dapat dimuat.");
          }
        },
      ),
    [invoiceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // UC-5 A1: while QUEUED/PROCESSING, poll the extraction endpoint and reload once it finishes.
  const processing = invoice ? isProcessing(invoice.status) : false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(async () => {
      try {
        const extraction = await invoiceService.extraction(invoiceId);
        if (!isProcessing(extraction.status)) void load();
        else setInvoice((current) => (current && current.status !== extraction.status ? { ...current, status: extraction.status } : current));
      } catch {
        /* the next poll will retry */
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [invoiceId, load, processing]);

  const requeue = async () => {
    setRequeueing(true);
    setRequeueError(null);
    try {
      await invoiceService.reextract(invoiceId);
      await load();
    } catch (err) {
      setRequeueError(err instanceof Error ? err.message : "Ekstraksi ulang gagal diantrekan.");
    } finally {
      setRequeueing(false);
    }
  };

  if (status === "loading") return <PageSpinner label="Memuat detail request..." />;
  if (status === "forbidden") return <ForbiddenState />;
  if (status === "missing") {
    return <ForbiddenState message="Request invoice tidak ditemukan. Periksa kembali tautan atau buka dari antrean." />;
  }
  if (!invoice) {
    return <ErrorBanner title="Detail request tidak dapat dimuat" message={error ?? "Terjadi kesalahan."} onRetry={() => void load()} />;
  }

  const missingBank = invoice.exception_codes.includes("MISSING_EVIDENCE");
  const canRequeue = invoice.status === "EXCEPTION" && invoice.exception_codes.some((code) => EXTRACTION_FAILURE_CODES.includes(code));

  return (
    <div className="mx-auto flex w-full max-w-[1366px] flex-col gap-5 pb-8">
      {/* Breadcrumb bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link href="/invoices" className="inline-flex items-center gap-1 font-semibold no-underline hover:underline">
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
          Kembali ke Antrean
        </Link>
        <span className="flex items-center gap-1.5 text-text-secondary">
          Peran: <span className="rounded bg-primary-subtle px-1.5 py-0.5 font-semibold text-primary">Staf Intake (Read-Only)</span>
        </span>
      </div>

      {error && <ErrorBanner title="Data terbaru belum dapat dimuat" message={error} onRetry={() => void load()} />}

      {/* Header card */}
      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-bold text-primary sm:text-2xl">{invoice.request_id}</h1>
            <StatusBadge status={invoice.status} size="md" />
            {invoice.is_draft && (
              <span className="inline-flex items-center gap-1 rounded border border-dashed border-border-strong px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">edit_note</span>
                Draf Ekstraksi
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Lihat file asli dokumen invoice"
            onClick={() => setViewerOpen(true)}
            className="flex h-9 items-center justify-center gap-1.5 rounded border border-primary px-4 text-xs font-semibold text-primary hover:bg-primary-subtle"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
            Lihat file asli
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <Fact label="Klien Entitas" value={invoice.client.name} hint={invoice.has_reviewer ? undefined : "Belum ada reviewer"} />
          <Fact label="Vendor Penerbit" value={invoice.vendor_name ?? (processing ? "Menunggu ekstraksi" : "Tidak ditemukan")} muted={!invoice.vendor_name} />
          <Fact label="Waktu Upload" value={formatDateTime(invoice.created_at)} hint={`oleh ${invoice.uploaded_by.name} • ${CHANNEL_LABELS[invoice.channel] ?? invoice.channel}`} />
          <Fact label="Nama File Masuk" value={invoice.original_filename} hint={formatBytes(invoice.file_size)} mono />
        </dl>
        {invoice.previous_request && (
          <p className="border-t border-border px-4 py-2.5 text-xs text-text-secondary sm:px-5">
            Unggah ulang dari{" "}
            <Link href={`/invoices/${invoice.previous_request.id}`} className="font-mono font-semibold">
              {invoice.previous_request.request_id}
            </Link>{" "}
            (ditolak).
          </p>
        )}
      </section>

      {processing ? (
        <section className="flex flex-col items-center rounded-lg border border-status-processing-border bg-info-subtle px-6 py-12 text-center">
          <span aria-hidden="true" className="material-symbols-outlined mb-3 animate-spin text-[36px] text-info">progress_activity</span>
          <h3 className="text-base font-semibold text-info">Dokumen Sedang Diproses</h3>
          <p className="mt-1 max-w-md text-xs text-text-secondary">
            Robot AMIGA sedang mengekstrak data invoice, baris barang, dan pajak. Tidak ada data parsial yang ditampilkan
            sebelum ekstraksi rampung. Halaman ini akan diperbarui otomatis.
          </p>
        </section>
      ) : (
        <>
          <DecisionBlock invoice={invoice} />

          {invoice.exceptions.length > 0 && (
            <section className="rounded-lg border border-status-exception-border bg-surface shadow-sm">
              <div className="border-b border-status-exception-border bg-warning-subtle px-4 py-3 sm:px-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">report</span>
                  Daftar Temuan Kendala
                </h3>
                <p className="text-xs text-text-secondary">Robot AMIGA mendeteksi ketidaksesuaian data berikut saat validasi otomatis.</p>
              </div>
              <ul className="divide-y divide-surface-muted">
                {invoice.exceptions.map((finding) => (
                  <li key={finding.code} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="shrink-0"><IssueChip code={finding.code} /></span>
                      <span className="text-xs text-text-primary">{finding.message}</span>
                    </div>
                    {canRequeue && EXTRACTION_FAILURE_CODES.includes(finding.code) && (
                      <button
                        type="button"
                        disabled={requeueing}
                        onClick={() => void requeue()}
                        className="flex h-8 shrink-0 items-center justify-center gap-1 rounded border border-border bg-surface px-3 text-xs font-semibold text-primary hover:bg-primary-subtle disabled:opacity-50"
                      >
                        <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${requeueing ? "animate-spin" : ""}`}>refresh</span>
                        Ekstrak ulang
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {requeueError && <p className="px-5 pb-3 text-xs text-danger">{requeueError}</p>}
            </section>
          )}

          {/* Read-only extracted data */}
          <section className="rounded-lg border border-border bg-surface shadow-sm">
            <SectionHeader icon="text_snippet" title="Data Ekstraksi Invoice" note="Read-only • Hasil AI berstatus draf" />
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              <DataField label="Vendor" value={invoice.vendor_name} />
              <DataField label="Nomor Invoice" value={invoice.invoice_number} mono />
              <DataField label="Rekening Tujuan (Bank & No. Rek)" value={invoice.bank_account} mono warn={missingBank} />
              <DataField label="Tanggal Invoice" value={invoice.invoice_date ? formatDate(invoice.invoice_date) : null} />
              <DataField label="Tanggal Penerimaan" value={formatDate(invoice.request_date)} />
              <DataField label="Diskon" value={formatRupiah(invoice.discount_amount)} mono />
              <DataField label="Pajak (PPN)" value={invoice.tax_amount !== null ? formatRupiah(invoice.tax_amount) : null} mono />
              <DataField label="Subtotal Baris" value={invoice.subtotal_amount !== null ? formatRupiah(invoice.subtotal_amount) : null} mono />
              <DataField label="Total Invoice Akhir" value={invoice.total_amount !== null ? formatRupiah(invoice.total_amount) : null} mono strong />
            </dl>
          </section>

          {/* Line items */}
          <section className="rounded-lg border border-border bg-surface shadow-sm">
            <SectionHeader
              icon="format_list_bulleted"
              title="Daftar Baris Barang / Jasa"
              badge={`${invoice.items.length} Item`}
              note="Satuan Rupiah (IDR)"
            />
            {invoice.items.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs italic text-text-disabled">Baris barang tidak ditemukan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="h-10 border-b border-border bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                      <th className="w-12 px-4">No</th>
                      <th className="px-3">Deskripsi Barang / Jasa</th>
                      <th className="px-3 text-right">Qty</th>
                      <th className="px-3 text-right">Harga Satuan</th>
                      <th className="px-4 text-right">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-muted">
                    {invoice.items.map((item) => (
                      <tr key={item.line_no} className="h-11">
                        <td className="px-4 font-mono text-text-secondary">{item.line_no}</td>
                        <td className="px-3">{item.description ?? <Missing />}</td>
                        <td className="px-3 text-right font-mono tabular-nums">{formatQuantity(item.quantity)}</td>
                        <td className="whitespace-nowrap px-3 text-right font-mono tabular-nums">{formatRupiah(item.unit_price)}</td>
                        <td className="whitespace-nowrap px-4 text-right font-mono font-semibold tabular-nums">{formatRupiah(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-surface-muted/60 font-mono tabular-nums">
                    <SummaryRow label="Subtotal Baris Barang" value={formatRupiah(invoice.subtotal_amount)} />
                    <SummaryRow label="Pajak (PPN)" value={formatRupiah(invoice.tax_amount)} />
                    <SummaryRow label="Potongan Diskon" value={`-${formatRupiah(invoice.discount_amount)}`} />
                    <SummaryRow label="Total Tagihan Final" value={formatRupiah(invoice.total_amount)} strong />
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Change history (AUD-05) */}
      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <button
          type="button"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((open) => !open)}
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
            <span aria-hidden="true" className={`material-symbols-outlined transition-transform ${historyOpen ? "rotate-180" : ""}`}>expand_more</span>
          </span>
        </button>
        {historyOpen && (
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
                  {(history ?? []).map((entry) => (
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
                  ))}
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

      {viewerOpen && <FileViewerModal invoiceId={invoice.id} onClose={() => setViewerOpen(false)} />}
    </div>
  );
}

function DecisionBlock({ invoice }: { invoice: InvoiceDetailData }) {
  const decision = invoice.decision;
  if (invoice.status === "REJECTED" && decision) {
    return (
      <section className="rounded-lg border border-status-rejected-border bg-danger-subtle p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 text-xs">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex items-center gap-1 font-bold text-status-rejected-fg">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">cancel</span>
                Ditolak
              </span>
              <span className="font-semibold">{decision.reviewer?.name ?? "Finance Reviewer"}</span>
              <span className="text-text-secondary">(Finance Reviewer)</span>
              {decision.decided_at && <span className="text-text-secondary">• {formatDateTime(decision.decided_at)}</span>}
            </p>
            {decision.reject_note && (
              <div>
                <p className="font-semibold text-text-secondary">Alasan Penolakan:</p>
                <p className="italic text-text-primary">“{decision.reject_note}”</p>
              </div>
            )}
            <p className="text-text-secondary">
              Request lama berstatus final. Perbaikan diunggah sebagai request baru dengan referensi request ini.
            </p>
          </div>
          <Link
            href={`/invoices/upload?previous=${invoice.id}`}
            className="flex shrink-0 flex-col items-center justify-center rounded bg-primary px-5 py-2 text-white no-underline hover:bg-primary-hover"
          >
            <span className="text-sm font-semibold">Unggah ulang</span>
            <span className="text-[11px] opacity-80">Buat Request Pengganti</span>
          </Link>
        </div>
      </section>
    );
  }
  if (decision?.reviewer && invoice.status !== "REJECTED") {
    return (
      <section className="rounded-lg border border-status-reviewed-border bg-success-subtle p-4 text-xs sm:p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 font-bold text-success">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">verified</span>
            Disetujui
          </span>
          <span className="font-semibold">{decision.reviewer.name}</span>
          <span className="text-text-secondary">(Finance Reviewer)</span>
          {decision.decided_at && <span className="text-text-secondary">• {formatDateTime(decision.decided_at)}</span>}
        </p>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted px-4 py-3 text-xs text-text-secondary sm:px-5">
      <span aria-hidden="true" className="material-symbols-outlined text-[20px]">hourglass_top</span>
      <span>
        Menunggu pemeriksaan oleh Finance Reviewer.
        {!invoice.has_reviewer && <strong className="ml-1 text-text-primary">Klien ini belum memiliki reviewer aktif.</strong>}
      </span>
    </section>
  );
}

function Fact({ label, value, hint, mono = false, muted = false }: { label: string; value: string; hint?: string; mono?: boolean; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold ${mono ? "font-mono text-[13px]" : ""} ${muted ? "italic text-text-disabled" : "text-text-primary"}`} title={value}>
        {value}
      </dd>
      {hint && <dd className="truncate text-[11px] text-text-secondary">{hint}</dd>}
    </div>
  );
}

function DataField({
  label,
  value,
  mono = false,
  strong = false,
  warn = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded border px-3 py-2.5 ${warn ? "border-status-exception-border bg-warning-subtle" : "border-surface-muted bg-background"}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{label}</dt>
      <dd className={`mt-0.5 break-words ${mono ? "font-mono tabular-nums" : ""} ${strong ? "text-base font-bold text-primary" : "text-sm font-medium"}`}>
        {value ?? <Missing />}
      </dd>
    </div>
  );
}

function Missing() {
  return <span className="font-sans text-sm font-normal italic text-text-disabled">Tidak ditemukan</span>;
}

function SectionHeader({ icon, title, note, badge }: { icon: string; title: string; note?: string; badge?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
        {title}
        {badge && <span className="rounded bg-primary-subtle px-1.5 py-0.5 text-[11px] font-semibold text-primary">{badge}</span>}
      </h3>
      {note && <span className="text-[11px] text-text-secondary">{note}</span>}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className={strong ? "h-11 border-t border-border" : "h-9"}>
      <td colSpan={4} className={`px-4 text-right font-sans ${strong ? "text-sm font-bold" : "text-text-secondary"}`}>{label}</td>
      <td className={`whitespace-nowrap px-4 text-right ${strong ? "text-sm font-bold text-primary" : "font-semibold"}`}>{value}</td>
    </tr>
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
