"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AssignedClient,
  InvoiceChannel,
  InvoiceDetail,
  InvoiceUploadResult,
  errorStatus,
  invoiceService,
} from "@/lib/api";
import { formatBytes, formatDateTime, todayIso } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { CHANNEL_LABELS } from "./meta";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};
const FILE_ERRORS = {
  heic: { title: "Format tidak didukung:", message: "Format HEIC belum didukung, ubah ke JPG atau PNG." },
  type: { title: "Format tidak didukung:", message: "Unggah berkas PDF, JPG, atau PNG." },
  size: { title: "Batas ukuran terlampaui:", message: "Ukuran berkas melebihi 10 MB. Unggah berkas yang lebih kecil." },
  count: { title: "Jumlah berkas dibatasi:", message: "Hanya satu file per request. Hapus file tambahan." },
};
type FileErrorKey = keyof typeof FILE_ERRORS;
type Banner = "revoked" | "storage" | null;

/** Client-side checks before upload; the backend still verifies the file content (UPL-02). */
function checkFile(file: File): FileErrorKey | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".heic") || name.endsWith(".heif") || file.type.includes("heic") || file.type.includes("heif")) return "heic";
  const typeOk = file.type in ACCEPTED_TYPES || /\.(pdf|jpe?g|png)$/.test(name);
  if (!typeOk) return "type";
  if (file.size > MAX_BYTES) return "size";
  return null;
}

/** Invoice upload form (UC-1, UPL-01 to UPL-04), following templates/invoice-upload.html. */
export default function InvoiceUploadForm() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const previousId = searchParams.get("previous");
  const fileInput = useRef<HTMLInputElement>(null);

  const [clients, setClients] = useState<AssignedClient[] | null>(null);
  const [previous, setPrevious] = useState<InvoiceDetail | null>(null);
  const [clientId, setClientId] = useState("");
  const [channel, setChannel] = useState<InvoiceChannel>("WhatsApp");
  const [requestDate, setRequestDate] = useState(todayIso());
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<FileErrorKey | null>(null);
  const [clientError, setClientError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<InvoiceUploadResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoiceService
      .assignedClients()
      .then((list) => {
        setClients(list);
        if (list.length === 1) setClientId((current) => current || list[0].id);
      })
      .catch(() => setClients([]));
  }, []);

  // UC-6 step 3: re-upload pre-fills the client and previous_request_id from the REJECTED request.
  useEffect(() => {
    if (!previousId) return;
    invoiceService
      .get(previousId)
      .then((detail) => {
        if (detail.status !== "REJECTED") return;
        setPrevious(detail);
        setClientId(detail.client.id);
      })
      .catch(() => setPrevious(null));
  }, [previousId]);

  const selectedClient = clients?.find((client) => client.id === clientId);
  const uploading = progress !== null;

  const pickFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setFileError("count");
      return;
    }
    const candidate = files[0];
    const problem = checkFile(candidate);
    setFileError(problem);
    setFile(problem ? null : candidate);
    setSubmitError(null);
  };

  const resetForm = () => {
    setFile(null);
    setFileError(null);
    setProgress(null);
    setBanner(null);
    setSubmitError(null);
    setResult(null);
    setCopied(false);
    setPrevious(null);
    setRequestDate(todayIso());
    if (fileInput.current) fileInput.current.value = "";
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setSubmitError(null);
    setBanner(null);
    const missingClient = !clientId;
    setClientError(missingClient);
    if (missingClient || !file || !requestDate) {
      if (!file) setSubmitError("Pilih satu berkas invoice untuk diunggah.");
      return;
    }

    const form = new FormData();
    form.set("client_id", clientId);
    form.set("channel", channel);
    form.set("request_date", requestDate);
    if (previous) form.set("previous_request_id", previous.id);
    form.set("file", file);

    setProgress(0);
    try {
      const uploaded = await invoiceService.upload(form, setProgress);
      setResult(uploaded);
    } catch (err) {
      const status = errorStatus(err);
      const message = err instanceof Error ? err.message : "Upload gagal.";
      if (status === 403) setBanner("revoked");
      else if (status === 502) setBanner("storage");
      else if (message.includes("HEIC")) setFileError("heic");
      else if (status === 413) setFileError("size");
      else setSubmitError(message);
    } finally {
      setProgress(null);
    }
  };

  if (result) {
    return <SuccessPanel result={result} staffName={user?.name ?? "-"} copied={copied} onCopy={() => {
      void navigator.clipboard.writeText(result.request_id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }} onAnother={resetForm} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col pb-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
        <Link href="/invoices" className="text-text-secondary no-underline hover:text-text-primary">Menu Intake</Link>
        <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span>
        <span className="font-semibold text-text-primary">Upload Invoice</span>
      </nav>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Upload Invoice</h1>
      <p className="mb-5 mt-0.5 text-xs text-text-secondary sm:text-sm">
        Unggah dokumen invoice dari vendor. Sistem AI AMIGA akan mengekstraksi data secara otomatis di latar belakang.
      </p>

      {banner === "revoked" && (
        <section role="alert" className="mb-4 flex gap-3 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg">
          <span aria-hidden="true" className="material-symbols-outlined">gpp_bad</span>
          <div>
            <h2 className="text-sm font-semibold text-status-rejected-fg">Akses Penugasan Klien Tidak Ditemukan</h2>
            <p className="text-xs">
              Penugasan Anda untuk klien ini telah dicabut. Perubahan tidak disimpan. Silakan hubungi koordinator Intake
              untuk pembaruan izin operasional.
            </p>
          </div>
        </section>
      )}
      {banner === "storage" && (
        <section role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg">
          <div className="flex gap-3">
            <span aria-hidden="true" className="material-symbols-outlined">cloud_off</span>
            <div>
              <h2 className="text-sm font-semibold text-status-rejected-fg">Penyimpanan Berkas Gagal</h2>
              <p className="text-xs">
                Gagal menyimpan berkas ke server. Request ID belum dibuat. Silakan periksa koneksi lalu coba beberapa saat lagi.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void submit()} className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">
            Coba lagi
          </button>
        </section>
      )}
      {previous && (
        <section aria-label="Informasi Unggah Ulang" className="mb-4 rounded-lg border border-status-processing-border bg-info-subtle p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-info">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">history_edu</span>
              Konteks Unggah Ulang Berkas
            </div>
            <StatusBadge status="REJECTED" />
          </div>
          <dl className="grid gap-2 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="text-text-secondary">Referensi Request ID Sebelumnya:</dt>
            <dd className="font-mono font-semibold text-primary">{previous.request_id}</dd>
            {previous.decision?.reject_note && (
              <>
                <dt className="text-text-secondary">Catatan Reviewer Sebelumnya:</dt>
                <dd className="italic text-text-primary">“{previous.decision.reject_note}”</dd>
              </>
            )}
          </dl>
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6">
        <form id="invoice-intake-form" noValidate onSubmit={(event) => void submit(event)} className="space-y-5">
          {/* Client */}
          <div>
            <label htmlFor="klien-select" className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
              <span>Klien <span className="text-danger" aria-hidden="true">*</span></span>
              {clients && <span className="normal-case tracking-normal font-normal text-text-secondary">{clients.length} klien terdaftar dalam penugasan Anda</span>}
            </label>
            <select
              id="klien-select"
              value={clientId}
              disabled={uploading || !!previous || clients === null}
              onChange={(event) => {
                setClientId(event.target.value);
                setClientError(false);
              }}
              aria-invalid={clientError}
              className={`h-10 w-full rounded border bg-white px-3 text-sm focus:ring-2 focus:ring-focus-ring disabled:bg-surface-muted ${clientError ? "border-danger" : "border-border-strong"}`}
            >
              <option value="">{clients === null ? "Memuat klien penugasan..." : "Pilih salah satu klien penugasan..."}</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.has_reviewer ? "" : " (Belum ada reviewer)"}
                </option>
              ))}
            </select>
            {clientError && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">Pilih klien penugasan terlebih dahulu.</p>}
            {clients?.length === 0 && (
              <p className="mt-1.5 text-xs text-warning">Anda belum ditugaskan ke klien mana pun. Hubungi System Admin untuk penugasan.</p>
            )}
            {selectedClient && !selectedClient.has_reviewer && (
              <p className="mt-2 flex items-start gap-1.5 rounded border border-chip-no-reviewer-border bg-chip-no-reviewer-bg px-3 py-2 text-xs text-chip-no-reviewer-fg">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">person_off</span>
                {selectedClient.name} saat ini belum memiliki reviewer aktif. Invoice tetap dapat diproses dan menunggu penetapan reviewer.
              </p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Request type (locked) */}
            <div>
              <label htmlFor="jenis-permintaan-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                Jenis Permintaan <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="jenis-permintaan-input"
                value="Pembayaran Vendor"
                readOnly
                className="h-10 w-full cursor-not-allowed rounded border border-border bg-surface-muted px-3 text-sm text-text-secondary"
              />
              <p className="mt-1 text-[11px] text-text-secondary">Terkunci otomatis untuk modul pembayaran invoice.</p>
            </div>
            {/* Channel */}
            <div>
              <label htmlFor="saluran-select" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                Saluran Masuk <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <select
                id="saluran-select"
                value={channel}
                disabled={uploading}
                onChange={(event) => setChannel(event.target.value as InvoiceChannel)}
                className="h-10 w-full rounded border border-border-strong bg-white px-3 text-sm focus:ring-2 focus:ring-focus-ring"
              >
                {(Object.keys(CHANNEL_LABELS) as InvoiceChannel[]).map((value) => (
                  <option key={value} value={value}>
                    {CHANNEL_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date received */}
          <div>
            <label htmlFor="tanggal-input" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
              Tanggal Penerimaan Dokumen <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              id="tanggal-input"
              type="date"
              value={requestDate}
              max={todayIso()}
              required
              disabled={uploading}
              onChange={(event) => setRequestDate(event.target.value)}
              className="h-10 w-full rounded border border-border-strong bg-white px-3 text-sm focus:ring-2 focus:ring-focus-ring sm:w-60"
            />
            <p className="mt-1 text-[11px] text-text-secondary">Tanggal permintaan diterima dari klien. Default adalah hari ini.</p>
          </div>

          {/* File */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="file-uploader" className="text-xs font-semibold uppercase tracking-wider">
                Berkas Invoice <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <span className="text-[11px] text-text-secondary">Maks. 1 berkas • PDF/JPG/PNG • ≤10 MB</span>
            </div>

            {file ? (
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-danger">
                    {file.type.startsWith("image/") ? "image" : "picture_as_pdf"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{file.name}</span>
                      <span className="rounded bg-success-subtle px-1.5 py-0.5 text-[10px] font-bold text-success">Siap</span>
                    </div>
                    <p className="text-[11px] text-text-secondary">
                      {formatBytes(file.size)} • Lolos verifikasi format lokal
                    </p>
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      aria-label="Hapus file"
                      title="Hapus file"
                      onClick={() => {
                        setFile(null);
                        if (fileInput.current) fileInput.current.value = "";
                      }}
                      className="rounded p-1.5 text-text-secondary hover:bg-surface hover:text-danger"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  )}
                </div>
                {uploading && (
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-text-secondary">
                      <span>Mengunggah berkas ke penyimpanan aman...</span>
                      <span className="font-mono">{progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <label
                htmlFor="file-uploader"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  pickFiles(event.dataTransfer.files);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  dragging ? "border-primary bg-primary-subtle" : fileError ? "border-danger bg-danger-subtle/40" : "border-border-strong bg-background hover:border-primary hover:bg-primary-subtle/40"
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined mb-2 text-[32px] text-primary">upload_file</span>
                <span className="text-sm text-text-primary">
                  Seret file ke sini atau <span className="font-semibold text-text-link underline">pilih file</span>
                </span>
                <span className="mt-1 text-[11px] text-text-secondary">
                  Format yang diterima: PDF, JPG, atau PNG. Maksimal 10 MB. Satu file per request.
                </span>
              </label>
            )}
            <input
              ref={fileInput}
              id="file-uploader"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="sr-only"
              onChange={(event) => pickFiles(event.target.files)}
            />

            {fileError && (
              <div role="alert" className="mt-2 flex items-start justify-between gap-2 rounded border border-danger bg-danger-subtle px-3 py-2 text-xs text-status-rejected-fg">
                <span>
                  <strong>{FILE_ERRORS[fileError].title}</strong> {FILE_ERRORS[fileError].message}
                </span>
                <button type="button" aria-label="Tutup pesan" onClick={() => setFileError(null)} className="font-bold">
                  ✕
                </button>
              </div>
            )}
          </div>

          {submitError && (
            <p role="alert" className="rounded border border-danger bg-danger-subtle px-3 py-2 text-xs text-status-rejected-fg">
              {submitError}
            </p>
          )}

          <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
            <span className="flex items-center gap-1.5 text-[11px] text-text-secondary">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-success">lock</span>
              Berkas disimpan di penyimpanan privat terenkripsi
            </span>
            <button
              id="btn-submit-upload"
              type="submit"
              disabled={uploading || clients?.length === 0}
              className="flex h-10 items-center justify-center gap-2 rounded bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-disabled"
            >
              {uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">cloud_upload</span>
              )}
              {uploading ? "Mengunggah..." : "Upload dan Proses"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function SuccessPanel({
  result,
  staffName,
  copied,
  onCopy,
  onAnother,
}: {
  result: InvoiceUploadResult;
  staffName: string;
  copied: boolean;
  onCopy: () => void;
  onAnother: () => void;
}) {
  return (
    <section id="panel-success" className="mx-auto w-full max-w-[720px] overflow-hidden rounded-lg border border-border bg-surface shadow-md">
      <div className="h-1.5 bg-success" />
      <div className="p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
              <span aria-hidden="true" className="material-symbols-outlined text-[24px]">check_circle</span>
            </div>
            <div>
              <h2 className="text-lg font-bold">Invoice Berhasil Diterima</h2>
              <p className="text-xs text-text-secondary">Waktu terima: {formatDateTime(result.created_at)}</p>
            </div>
          </div>
          <StatusBadge status={result.status} size="md" />
        </div>

        <div className="mb-4 rounded-lg border border-status-vouchered-border bg-primary-subtle p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Kode Identifikasi Antrean</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-primary">{result.request_id}</span>
            <button type="button" aria-label="Salin Request ID" title="Salin Request ID" onClick={onCopy} className="rounded p-1 text-primary hover:bg-white/70">
              <span className="material-symbols-outlined text-[20px]">content_copy</span>
            </button>
            {copied && <span className="text-xs font-semibold text-success">Tersalin!</span>}
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            Klien: <span className="font-semibold text-text-primary">{result.client.name}</span>
          </p>
        </div>

        {!result.has_reviewer && (
          <div className="mb-4 flex gap-2 rounded border border-chip-no-reviewer-border bg-chip-no-reviewer-bg p-3 text-xs text-chip-no-reviewer-fg">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">person_off</span>
            <div>
              <p className="font-semibold">Belum Ada Reviewer Terdaftar</p>
              <p>Dokumen tersimpan aman dalam status QUEUED. Ekstraksi AI tetap berjalan dan dokumen menunggu penetapan Finance Reviewer.</p>
            </div>
          </div>
        )}

        <p className="mb-4 flex gap-2 text-xs text-text-secondary">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
          <span>
            Dokumen telah masuk antrean pemrosesan AI di latar belakang. Data draf akan diekstraksi otomatis dan diteruskan ke
            Finance Reviewer. Anda dapat memantau progresnya di{" "}
            <Link href="/invoices" className="font-semibold">Antrean</Link>.
          </span>
        </p>

        <div className="mb-5 rounded border border-border">
          <p className="border-b border-border bg-surface-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
            Rangkuman Penerimaan:
          </p>
          <dl className="divide-y divide-surface-muted text-xs">
            {[
              ["File Terunggah", `${result.original_filename} (${formatBytes(result.file_size)})`],
              ["Saluran", CHANNEL_LABELS[result.channel] ?? result.channel],
              ["Staf Penerima", staffName],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-text-secondary">{label}</dt>
                <dd className="truncate text-right font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onAnother} className="flex h-10 items-center justify-center gap-1.5 rounded border border-border px-4 text-sm font-semibold hover:bg-surface-muted">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_circle</span>
            Upload invoice lain
          </button>
          <Link
            href={`/invoices/${result.id}`}
            className="flex h-10 items-center justify-center gap-1.5 rounded bg-primary px-5 text-sm font-semibold text-white no-underline hover:bg-primary-hover"
          >
            Lihat request
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
