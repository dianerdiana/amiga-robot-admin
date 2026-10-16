"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuditEntry, InvoiceDetail as InvoiceDetailData, errorStatus, invoiceService } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import DecisionBlock from "./DecisionBlock";
import ExtractedData from "./ExtractedData";
import FileViewerModal from "./FileViewerModal";
import FindingsList from "./FindingsList";
import HistoryPanel from "./HistoryPanel";
import InvoiceCorrectionForm from "./InvoiceCorrectionForm";
import { ErrorBanner, ForbiddenState, PageSpinner } from "./States";
import { StatusBadge } from "./StatusBadge";
import { CHANNEL_LABELS, EXTRACTION_FAILURE_CODES, isProcessing } from "./meta";

const POLL_INTERVAL_MS = 3000;

/** Read-only request detail for Intake (UC-5, UC-6), following templates/request-detail.html. */
export default function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetailData | null>(null);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [requeueing, setRequeueing] = useState(false);
  const [requeueError, setRequeueError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
          Peran:{" "}
          <span className="rounded bg-primary-subtle px-1.5 py-0.5 font-semibold text-primary">
            {invoice.can_edit ? "Staf Intake" : "Staf Intake (Read-Only)"}
          </span>
        </span>
      </div>

      {error && <ErrorBanner title="Data terbaru belum dapat dimuat" message={error} onRetry={() => void load()} />}

      {conflict && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className="material-symbols-outlined">sync_problem</span>
            {conflict} Perubahan lokal tidak disimpan.
          </span>
          <button
            type="button"
            onClick={() => {
              setConflict(null);
              setEditing(false);
              void load();
            }}
            className="h-9 shrink-0 rounded bg-danger px-4 text-xs font-semibold text-white hover:opacity-90"
          >
            Muat Ulang
          </button>
        </div>
      )}

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
          <div className="flex flex-wrap gap-2">
            {invoice.can_edit && !editing && (
              <button
                type="button"
                onClick={() => {
                  setConflict(null);
                  setEditing(true);
                }}
                className="flex h-9 items-center justify-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">edit</span>
                Koreksi Data
              </button>
            )}
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
        {invoice.last_correction && (
          <details className="group border-t border-border px-4 py-2.5 text-xs sm:px-5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-warning">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit_note</span>
              <span>
                Dikoreksi oleh <strong>{invoice.last_correction.by.name}</strong> · {formatDateTime(invoice.last_correction.at)}
              </span>
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-180">expand_more</span>
            </summary>
            <p className="mt-1.5 rounded bg-warning-subtle px-3 py-2 italic text-text-primary">“{invoice.last_correction.reason}”</p>
          </details>
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

          <FindingsList
            exceptions={invoice.exceptions}
            requeue={canRequeue ? { busy: requeueing, error: requeueError, onRequeue: () => void requeue() } : undefined}
          />

          {editing ? (
            <InvoiceCorrectionForm
              invoice={invoice}
              onCancel={() => setEditing(false)}
              onConflict={setConflict}
              onSaved={(saved) => {
                setInvoice(saved);
                setEditing(false);
                setToast("Perubahan berhasil disimpan.");
                window.setTimeout(() => setToast(null), 3500);
                void load();
              }}
            />
          ) : (
            <ExtractedData invoice={invoice} />
          )}
        </>
      )}

      {/* Change history (AUD-05) */}
      <HistoryPanel history={history} />

      {viewerOpen && <FileViewerModal invoiceId={invoice.id} onClose={() => setViewerOpen(false)} />}
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>
          {toast}
        </div>
      )}
    </div>
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
