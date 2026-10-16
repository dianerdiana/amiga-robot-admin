"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, AuditEntry, InvoiceDetail, errorStatus, invoiceService } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import DecisionBlock from "@/components/invoices/DecisionBlock";
import ExtractedData from "@/components/invoices/ExtractedData";
import FindingsList from "@/components/invoices/FindingsList";
import HistoryPanel from "@/components/invoices/HistoryPanel";
import InvoiceCorrectionForm from "@/components/invoices/InvoiceCorrectionForm";
import { ErrorBanner, ForbiddenState, PageSpinner } from "@/components/invoices/States";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import { CHANNEL_LABELS, isProcessing } from "@/components/invoices/meta";
import DecisionDialog, { DecisionKind } from "./DecisionDialog";
import DocumentPane from "./DocumentPane";

const POLL_INTERVAL_MS = 3000;

/**
 * Finance Reviewer split-screen (UC-7, UC-8), following templates/invoice-review.html: the original
 * file on the left; findings, the correction form, and the decision actions on the right. Every rule
 * (status, version, SoD, client assignment) is enforced by the backend; the flags only drive the UI.
 */
export default function ReviewWorkspace({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [history, setHistory] = useState<AuditEntry[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<DecisionKind | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"doc" | "data">("data");

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
            setError(err instanceof Error ? err.message : "Dokumen tidak dapat dimuat.");
          }
        },
      ),
    [invoiceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // While QUEUED/PROCESSING, poll the extraction endpoint and reload once it finishes.
  const processing = invoice ? isProcessing(invoice.status) : false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(async () => {
      try {
        const extraction = await invoiceService.extraction(invoiceId);
        if (!isProcessing(extraction.status)) void load();
      } catch {
        /* the next poll will retry */
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [invoiceId, load, processing]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const reload = () => {
    setConflict(null);
    setActionError(null);
    void load();
  };

  const openDialog = (kind: DecisionKind) => {
    setDialogError(null);
    setActionError(null);
    setDialog(kind);
  };

  const decide = async (note: string) => {
    if (!invoice || !dialog) return;
    setDeciding(true);
    setDialogError(null);
    try {
      const saved =
        dialog === "approve"
          ? await invoiceService.approve(invoice.id, { version: invoice.version, note: note || null })
          : await invoiceService.reject(invoice.id, { version: invoice.version, note });
      setDialog(null);
      setDirty(false);
      setInvoice(saved);
      showToast(dialog === "approve" ? `${saved.request_id} disetujui.` : `${saved.request_id} ditolak.`);
      void load();
    } catch (err) {
      const code = errorStatus(err);
      const issues = (err as ApiError).detail ?? [];
      const message = err instanceof Error ? err.message : "Keputusan gagal disimpan.";
      if (code === 422 && issues.length) {
        setDialogError(issues.map((issue) => issue.msg).join(" "));
      } else {
        setDialog(null);
        if (code === 409) setConflict(message);
        else setActionError(message);
      }
    } finally {
      setDeciding(false);
    }
  };

  if (status === "loading") return <PageSpinner label="Memuat dokumen review..." />;
  if (status === "forbidden") {
    return (
      <ForbiddenState
        backHref="/reviews"
        message="Anda tidak memiliki akses ke dokumen ini. Klien tidak ditugaskan kepada Anda atau penugasan telah dicabut."
      />
    );
  }
  if (status === "missing") {
    return <ForbiddenState backHref="/reviews" message="Dokumen tidak ditemukan. Periksa kembali tautan atau buka dari antrean." />;
  }
  if (!invoice) {
    return <ErrorBanner title="Dokumen tidak dapat dimuat" message={error ?? "Terjadi kesalahan."} onRetry={() => void load()} />;
  }

  const duplicate = invoice.status === "POSSIBLE_DUPLICATE";
  // A reviewer can edit but not reject only when they uploaded the document (SoD, ACC-04).
  const isUploader = invoice.can_edit && !invoice.can_reject;
  const approveHint = dirty
    ? "Simpan perubahan terlebih dahulu"
    : invoice.can_approve
      ? undefined
      : isUploader
        ? "Anda tidak dapat meninjau dokumen yang Anda unggah"
        : "Dokumen belum siap disetujui (ada temuan validasi)";
  const rejectHint = invoice.can_reject ? undefined : "Anda tidak dapat meninjau dokumen yang Anda unggah";
  const duplicateFinding = invoice.exceptions.find((finding) => finding.code === "POSSIBLE_DUPLICATE")?.message;

  // Uses the form's own dirty flag so the buttons never lag behind an edit.
  const actions = ({ dirty: formDirty, saving }: { dirty: boolean; saving: boolean }) => (
    <>
      <span title={rejectHint} className="inline-flex">
        <button
          type="button"
          disabled={!invoice.can_reject || saving}
          onClick={() => openDialog("reject")}
          className="flex h-9 items-center gap-1.5 rounded border border-danger bg-white px-4 text-xs font-semibold text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
          Tolak
        </button>
      </span>
      <span title={approveHint} className="inline-flex">
        <button
          type="button"
          disabled={!invoice.can_approve || formDirty || saving}
          onClick={() => openDialog("approve")}
          className="flex h-9 items-center gap-1.5 rounded bg-success px-5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-border-strong"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check</span>
          Setujui
        </button>
      </span>
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      {/* Header strip */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/reviews" className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary no-underline hover:text-text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
            Kembali ke Antrean
          </Link>
          <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
          <h1 className="font-mono text-lg font-bold text-primary">{invoice.request_id}</h1>
          <Chip icon="corporate_fare" label="Klien" value={invoice.client.name} />
          <Chip icon="storefront" label="Vendor" value={invoice.vendor_name ?? "-"} />
          <Chip
            icon="schedule"
            label="Diunggah"
            value={`${formatDateTime(invoice.created_at)} oleh ${invoice.uploaded_by.name} • ${CHANNEL_LABELS[invoice.channel] ?? invoice.channel}`}
          />
        </div>
        <StatusBadge status={invoice.status} size="md" />
      </section>

      {error && <ErrorBanner title="Data terbaru belum dapat dimuat" message={error} onRetry={() => void load()} />}
      {(conflict || actionError) && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2 text-sm">
            <span aria-hidden="true" className="material-symbols-outlined">{conflict ? "sync_problem" : "block"}</span>
            {conflict ? `${conflict} Perubahan lokal tidak disimpan.` : actionError}
          </span>
          <button type="button" onClick={reload} className="flex h-9 shrink-0 items-center gap-1 rounded bg-danger px-4 text-xs font-semibold text-white hover:opacity-90">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">refresh</span>
            Muat Ulang
          </button>
        </div>
      )}

      {/* Below lg the panes stack behind a Dokumen / Data tab bar (templates/invoice-review-mobile.html). */}
      <div role="tablist" aria-label="Tampilan review" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-muted p-1 lg:hidden">
        {(
          [
            ["doc", "description", "Dokumen"],
            ["data", "fact_check", "Data Faktur"],
          ] as const
        ).map(([key, icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex h-9 items-center justify-center gap-1.5 rounded text-xs font-semibold ${
              tab === key ? "bg-surface text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{icon}</span>
            {label}
            {key === "data" && invoice.exceptions.length > 0 && (
              <span className="rounded-full bg-warning-subtle px-1.5 text-[10px] text-warning">{invoice.exceptions.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-10rem)] lg:min-h-[560px] lg:grid-cols-2 lg:gap-5">
        <div className={`${tab === "doc" ? "block" : "hidden"} h-[75vh] lg:block lg:h-full`}>
          <DocumentPane invoiceId={invoice.id} />
        </div>

        <div
          className={`${tab === "data" ? "flex" : "hidden"} min-w-0 flex-col gap-4 rounded-lg border border-border bg-background px-4 pt-4 sm:px-6 lg:flex lg:overflow-y-auto ${
            invoice.can_edit ? "" : "pb-4"
          }`}
        >
          {processing ? (
            <section className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <span aria-hidden="true" className="material-symbols-outlined mb-3 animate-spin text-[36px] text-info">progress_activity</span>
              <h3 className="text-base font-semibold text-info">Dokumen Sedang Diproses</h3>
              <p className="mt-1 max-w-sm text-xs text-text-secondary">
                Robot AMIGA sedang mengekstrak data invoice. Data belum siap diverifikasi; halaman ini akan diperbarui otomatis.
              </p>
            </section>
          ) : (
            <>
              {invoice.decision && <DecisionBlock invoice={invoice} showReupload={false} />}

              {duplicate && (
                <div className="flex items-start gap-3 rounded-lg bg-status-duplicate-bg p-4 text-status-duplicate-fg shadow-sm">
                  <span aria-hidden="true" className="material-symbols-outlined text-[22px]">content_copy</span>
                  <div className="text-xs leading-relaxed">
                    <p className="text-sm font-bold">Kemungkinan Duplikat</p>
                    <p>
                      Periksa invoice pembanding sebelum memutuskan. Data tetap dapat dikoreksi; persetujuan manual wajib
                      disertai catatan justifikasi.
                    </p>
                  </div>
                </div>
              )}

              {isUploader && (
                <p className="flex items-center gap-2 rounded-lg border border-status-exception-border bg-warning-subtle px-4 py-3 text-xs text-warning">
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">shield_person</span>
                  Anda tercatat sebagai pengunggah dokumen ini, sehingga tidak dapat menyetujui atau menolaknya.
                </p>
              )}

              <FindingsList exceptions={invoice.exceptions} />

              {invoice.last_correction && (
                <details className="group rounded-lg border border-border bg-surface px-4 py-2.5 text-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-warning">
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit_note</span>
                    <span>
                      Terakhir dikoreksi oleh <strong>{invoice.last_correction.by.name}</strong> · {formatDateTime(invoice.last_correction.at)}
                    </span>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-180">expand_more</span>
                  </summary>
                  <p className="mt-1.5 rounded bg-warning-subtle px-3 py-2 italic text-text-primary">“{invoice.last_correction.reason}”</p>
                </details>
              )}

              {/* History sits above the form so the form's sticky action bar stays last in the pane. */}
              <HistoryPanel history={history} />

              {invoice.can_edit ? (
                <InvoiceCorrectionForm
                  // Remount after every save or reload so the form starts from the stored data.
                  key={invoice.version}
                  invoice={invoice}
                  variant="pane"
                  onDirtyChange={setDirty}
                  onConflict={setConflict}
                  onSaved={(saved) => {
                    setInvoice(saved);
                    setDirty(false);
                    showToast("Perubahan berhasil disimpan dan divalidasi ulang.");
                    void load();
                  }}
                  renderActions={actions}
                />
              ) : (
                <ExtractedData invoice={invoice} />
              )}
            </>
          )}
        </div>
      </div>

      {dialog && (
        <DecisionDialog
          kind={dialog}
          requestId={invoice.request_id}
          noteRequired={dialog === "reject" || invoice.approve_requires_note}
          context={[
            ...(dialog === "approve" && duplicateFinding ? [duplicateFinding] : []),
            ...(dialog === "reject" && dirty ? ["Perubahan yang belum disimpan akan dibuang."] : []),
          ]}
          error={dialogError}
          busy={deciding}
          onConfirm={(note) => void decide(note)}
          onClose={() => setDialog(null)}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-[60] flex max-w-sm items-center gap-3 rounded-lg bg-text-primary px-4 py-3 text-xs text-white shadow-lg">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-status-reviewed-border">check_circle</span>
          {toast}
        </div>
      )}
    </div>
  );
}

function Chip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <span className="hidden max-w-[320px] items-center gap-1 truncate rounded-md border border-border bg-surface-muted px-2.5 py-1 text-xs text-text-secondary xl:inline-flex" title={value}>
      <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">{icon}</span>
      <strong className="font-medium text-text-primary">{label}:</strong>
      <span className="truncate">{value}</span>
    </span>
  );
}
