"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AssignedClient,
  EligibleInvoice,
  VoucherDetail,
  VoucherVendor,
  errorStatus,
  invoiceService,
  voucherService,
} from "@/lib/api";
import { formatDate, formatRupiah } from "@/lib/format";
import FileViewerModal from "@/components/invoices/FileViewerModal";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import DownloadVoucherButton from "./DownloadVoucherButton";
import { VoucherStatusChip } from "./meta";
import VoucherPreview from "./VoucherPreview";

export const PURPOSE_MAX = 255;

type Step = "select" | "preview" | "done";
type Banner = { kind: "conflict" | "revoked" | "failed"; message: string } | null;

const BANNER_ICONS: Record<NonNullable<Banner>["kind"], string> = {
  conflict: "sync_problem",
  revoked: "gpp_bad",
  failed: "error",
};

/** Why a row cannot join the current selection (VCH-03), or null when it can. */
function disabledReason(invoice: EligibleInvoice, lockKey: string | null): string | null {
  if (!invoice.bank_key) return "Rekening tujuan kosong";
  if (invoice.total_amount === null) return "Total invoice kosong";
  if (lockKey && invoice.bank_key !== lockKey) return "Rekening berbeda dengan invoice terpilih";
  return null;
}

/**
 * Buat Voucher (UC-2, VCH-01 to VCH-07), following templates/voucher-create.html (step 1) and
 * templates/voucher-create-preview.html (step 2). Both steps share this component's state so
 * "Ubah pilihan" returns with the selection intact (UC-2 A1). The backend re-checks every rule.
 */
export default function VoucherCreate() {
  const [clients, setClients] = useState<AssignedClient[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [vendors, setVendors] = useState<VoucherVendor[] | null>(null);
  const [vendorKey, setVendorKey] = useState("");
  const [invoices, setInvoices] = useState<EligibleInvoice[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [purpose, setPurpose] = useState("");
  const [purposeTouched, setPurposeTouched] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [step, setStep] = useState<Step>("select");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<VoucherDetail | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const loadVendors = useCallback((client: string) => {
    setVendors(null);
    return voucherService.vendors(client).then(
      (list) => {
        setVendors(list);
        setLoadError(null);
        return list;
      },
      (err) => {
        setVendors([]);
        if (errorStatus(err) === 403) setBanner({ kind: "revoked", message: err.message });
        else setLoadError(err instanceof Error ? err.message : "Daftar vendor tidak dapat dimuat.");
        return [] as VoucherVendor[];
      },
    );
  }, []);

  const loadInvoices = useCallback((client: string, vendor: string) => {
    setInvoices(null);
    return voucherService.eligibleInvoices(client, vendor).then(
      (list) => {
        setInvoices(list);
        setLoadError(null);
        // Drop selections that are no longer eligible (e.g. used by another voucher meanwhile).
        setSelected((current) => current.filter((id) => list.some((invoice) => invoice.id === id)));
      },
      (err) => {
        setInvoices([]);
        if (errorStatus(err) === 403) setBanner({ kind: "revoked", message: err.message });
        else setLoadError(err instanceof Error ? err.message : "Daftar invoice tidak dapat dimuat.");
      },
    );
  }, []);

  // VCH-01: the vendor list depends on the client; a single vendor is preselected.
  const changeClient = useCallback(
    (id: string) => {
      setClientId(id);
      setVendorKey("");
      setVendors(id ? null : []);
      setInvoices(null);
      setSelected([]);
      setBanner(null);
      if (!id) return;
      void loadVendors(id).then((list) => {
        const only = list.length === 1 ? list[0].key : "";
        setVendorKey(only);
        if (only) void loadInvoices(id, only);
      });
    },
    [loadInvoices, loadVendors],
  );

  const changeVendor = (key: string) => {
    setVendorKey(key);
    setInvoices(null);
    setSelected([]);
    if (key) void loadInvoices(clientId, key);
  };

  useEffect(() => {
    invoiceService
      .assignedClients()
      .then((list) => {
        setClients(list);
        if (list.length === 1) changeClient(list[0].id);
      })
      .catch(() => setClients([]));
  }, [changeClient]);

  /** Reload after a conflict (VCH-07): vendors may disappear, invoices may be used. */
  const reloadList = async () => {
    if (!clientId) return;
    const list = await loadVendors(clientId);
    if (vendorKey && list.some((vendor) => vendor.key === vendorKey)) await loadInvoices(clientId, vendorKey);
    else {
      const only = list.length === 1 ? list[0].key : "";
      setVendorKey(only);
      setInvoices(null);
      setSelected([]);
      if (only) await loadInvoices(clientId, only);
    }
  };

  const selectedInvoices = useMemo(
    () => (invoices ?? []).filter((invoice) => selected.includes(invoice.id)),
    [invoices, selected],
  );
  // The first checked row fixes the bank account for the whole voucher (VCH-03).
  const lockKey = selectedInvoices.find((invoice) => invoice.id === selected[0])?.bank_key ?? null;
  const total = selectedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount ?? 0), 0);
  const client = clients?.find((item) => item.id === clientId) ?? null;
  const vendor = vendors?.find((item) => item.key === vendorKey) ?? null;
  const purposeText = purpose.trim();
  const purposeError = purposeTouched && !purposeText ? "Peruntukan wajib diisi sebelum melanjutkan ke pratinjau." : null;
  const canPreview = selectedInvoices.length > 0 && purposeText.length > 0;

  const selectable = (invoices ?? []).filter((invoice) => !disabledReason(invoice, lockKey));
  const allSelected = selectable.length > 0 && selectable.every((invoice) => selected.includes(invoice.id));

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const toggleAll = () => {
    if (allSelected) setSelected([]);
    else setSelected((current) => [...current, ...selectable.map((invoice) => invoice.id).filter((id) => !current.includes(id))]);
  };

  const goPreview = () => {
    setPurposeTouched(true);
    if (!canPreview) return;
    setBanner(null);
    setStep("preview");
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    if (!client || !canPreview) return;
    setCreating(true);
    setBanner(null);
    try {
      const voucher = await voucherService.create({
        client_id: client.id,
        invoice_ids: selectedInvoices.map((invoice) => invoice.id),
        purpose: purposeText,
      });
      setCreated(voucher);
      setStep("done");
      window.scrollTo({ top: 0 });
    } catch (err) {
      const code = errorStatus(err);
      const message = err instanceof Error ? err.message : "Voucher gagal dibuat, coba lagi.";
      if (code === 409) {
        // UC-2 A2: back to the table with a fresh list.
        setBanner({ kind: "conflict", message });
        setStep("select");
        void reloadList();
      } else if (code === 403) {
        setBanner({ kind: "revoked", message });
      } else {
        setBanner({ kind: "failed", message });
      }
    } finally {
      setCreating(false);
    }
  };

  const startOver = () => {
    setCreated(null);
    setSelected([]);
    setPurpose("");
    setPurposeTouched(false);
    setStep("select");
    void reloadList();
  };

  const bannerView = banner && (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-status-rejected-fg sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-2 text-sm">
        <span aria-hidden="true" className="material-symbols-outlined">{BANNER_ICONS[banner.kind]}</span>
        {banner.message}
      </span>
      {banner.kind === "revoked" ? (
        <Link href="/invoices" className="flex h-9 shrink-0 items-center gap-1 rounded border border-danger bg-white px-4 text-xs font-semibold text-danger no-underline hover:bg-danger-subtle">
          Kembali ke Antrean
        </Link>
      ) : (
        <button type="button" onClick={() => setBanner(null)} aria-label="Tutup pesan" className="shrink-0 rounded p-1 hover:bg-white/60">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );

  if (step === "done" && created) {
    return <VoucherCreated voucher={created} onStartOver={startOver} />;
  }

  if (step === "preview" && client && vendor) {
    return (
      <VoucherPreview
        client={client}
        vendorName={vendor.name}
        invoices={selectedInvoices}
        purpose={purposeText}
        banner={bannerView}
        creating={creating}
        onBack={() => {
          setBanner(null);
          setStep("select");
        }}
        onSubmit={() => void submit()}
        onViewFile={setViewing}
        viewer={viewing && <FileViewerModal invoiceId={viewing} onClose={() => setViewing(null)} />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1366px] flex-col gap-4">
      <header>
        <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs">
          <Link href="/invoices" className="text-text-secondary no-underline hover:text-text-primary">Menu Intake</Link>
          <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span>
          <span className="font-semibold text-text-primary">Buat Voucher</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Buat Voucher</h1>
          <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-secondary">Langkah 1 dari 2: Pemilihan Invoice</span>
          <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">lock</span>
            1 Klien • 1 Vendor • 1 Rekening
          </span>
        </div>
        <p className="mt-1 text-xs text-text-secondary sm:text-sm">
          Pilih invoice yang telah disetujui (<span className="font-mono font-semibold">AMIGA_REVIEWED</span>) untuk digabungkan ke dalam satu voucher pembayaran.
        </p>
      </header>

      {bannerView}
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-sm text-status-rejected-fg">
          {loadError}
          <button type="button" onClick={() => void reloadList()} className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold hover:bg-white/60">Coba lagi</button>
        </div>
      )}

      {/* Criteria: client, vendor, purpose */}
      <section className="max-w-[720px] rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">tune</span>
          Kriteria Pembayaran &amp; Vendor
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="voucher-client" label="Klien" hint="Hanya menampilkan klien yang ditugaskan kepada Anda.">
            <select
              id="voucher-client"
              value={clientId}
              disabled={clients === null}
              onChange={(event) => changeClient(event.target.value)}
              className="h-10 w-full rounded border border-border-strong bg-white px-3 text-sm focus:ring-2 focus:ring-focus-ring disabled:bg-surface-muted"
            >
              <option value="">{clients === null ? "Memuat klien..." : "Pilih klien..."}</option>
              {clients?.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </Field>
          <Field id="voucher-vendor" label="Vendor" hint="Hanya vendor dengan invoice AMIGA_REVIEWED yang belum bervoucher.">
            <select
              id="voucher-vendor"
              value={vendorKey}
              disabled={!clientId || vendors === null || vendors.length === 0}
              onChange={(event) => changeVendor(event.target.value)}
              className="h-10 w-full rounded border border-border-strong bg-white px-3 text-sm focus:ring-2 focus:ring-focus-ring disabled:bg-surface-muted"
            >
              <option value="">
                {!clientId ? "Pilih klien dahulu" : vendors === null ? "Memuat vendor..." : vendors.length === 0 ? "Tidak ada vendor siap voucher" : "Pilih vendor..."}
              </option>
              {vendors?.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name} ({item.invoice_count} invoice)
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="voucher-purpose" className="text-xs font-semibold text-text-primary">
                Peruntukan Pembayaran <span className="text-danger">*</span>
              </label>
              <span className="font-mono text-[11px] text-text-secondary">{purpose.length}/{PURPOSE_MAX}</span>
            </div>
            <textarea
              id="voucher-purpose"
              rows={2}
              maxLength={PURPOSE_MAX}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              onBlur={() => setPurposeTouched(true)}
              placeholder="Contoh: Pembayaran pengadaan ATK kantor cabang Sudirman"
              aria-invalid={Boolean(purposeError)}
              aria-describedby="voucher-purpose-hint"
              className={`w-full rounded border bg-white p-2.5 text-sm focus:ring-2 focus:ring-focus-ring ${purposeError ? "border-danger" : "border-border-strong"}`}
            />
            <p id="voucher-purpose-hint" className={`mt-1 text-[11px] ${purposeError ? "font-medium text-danger" : "text-text-secondary"}`}>
              {purposeError ?? "Wajib diisi sebelum melanjutkan ke pratinjau voucher."}
            </p>
          </div>
        </div>
      </section>

      {/* Invoice picker (VCH-02, VCH-03) */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Daftar Invoice Terverifikasi
            {invoices && <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] text-primary">{invoices.length} Siap Dibuatkan</span>}
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-text-secondary">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-status-ready-border" />Kompatibel</span>
            <span className="flex items-center gap-1"><span aria-hidden="true" className="material-symbols-outlined text-[14px]">lock</span>Terkunci (aturan rekening)</span>
          </div>
        </div>

        {!clientId || !vendorKey ? (
          <EmptyState icon="filter_alt" title="Pilih klien dan vendor" message="Daftar invoice muncul setelah klien dan vendor dipilih." />
        ) : invoices === null ? (
          <div className="divide-y divide-surface-muted">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse px-4 py-3"><div className="h-5 rounded bg-surface-muted" /></div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Tidak ada invoice yang siap dibuatkan voucher"
            message="Semua invoice AMIGA_REVIEWED untuk vendor ini sudah masuk voucher atau belum disetujui reviewer."
            action={<button type="button" onClick={() => void reloadList()} className="mt-4 h-9 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted">Muat Ulang Daftar</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="h-10 border-b border-border bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  <th className="w-12 pl-4">
                    <input type="checkbox" aria-label="Pilih semua invoice yang kompatibel" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0} className="h-4 w-4 accent-primary" />
                  </th>
                  <th className="px-3 py-2">Nomor Invoice</th>
                  <th className="px-3 py-2">Tanggal</th>
                  <th className="px-3 py-2">Rekening Tujuan</th>
                  <th className="px-3 py-2 text-right">Total Tagihan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="py-2 pl-3 pr-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted text-xs">
                {invoices.map((invoice) => {
                  const checked = selected.includes(invoice.id);
                  const reason = checked ? null : disabledReason(invoice, lockKey);
                  return (
                    <tr key={invoice.id} className={`h-14 ${checked ? "bg-primary-subtle/50" : reason ? "bg-surface-muted/60 text-text-disabled" : "hover:bg-primary-subtle/30"}`}>
                      <td className="pl-4">
                        <input
                          type="checkbox"
                          aria-label={`Pilih invoice ${invoice.invoice_number ?? invoice.request_id}`}
                          checked={checked}
                          disabled={Boolean(reason)}
                          onChange={() => toggle(invoice.id)}
                          className="h-4 w-4 accent-primary disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className={`flex items-center gap-1 font-mono font-semibold ${reason ? "" : "text-text-primary"}`}>
                          {invoice.invoice_number ?? "-"}
                          {reason && <span aria-hidden="true" className="material-symbols-outlined text-[14px]">lock</span>}
                        </p>
                        <p className="font-mono text-[11px] text-text-secondary">{invoice.request_id}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(invoice.invoice_date)}</td>
                      <td className="px-3 py-2">
                        <p className={`font-mono ${reason ? "" : "text-text-primary"}`}>{invoice.bank_account ?? "-"}</p>
                        {reason ? (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-warning">
                            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">info</span>
                            {reason}
                          </p>
                        ) : (
                          <p className="text-[11px] text-text-secondary">a.n. {invoice.vendor_name ?? "-"}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums">{formatRupiah(invoice.total_amount)}</td>
                      <td className="px-3 py-2"><StatusBadge status="AMIGA_REVIEWED" /></td>
                      <td className="py-2 pl-3 pr-4 text-right">
                        {/* VCH-04: the modal keeps the form and its checks intact. */}
                        <button
                          type="button"
                          onClick={() => setViewing(invoice.id)}
                          aria-label={`Lihat file asli ${invoice.original_filename}`}
                          title="Lihat file asli"
                          className="inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-surface text-primary hover:border-primary hover:bg-primary-subtle"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="flex items-start gap-1.5 border-t border-border bg-surface-muted px-4 py-2.5 text-[11px] text-text-secondary sm:px-5">
          <span aria-hidden="true" className="material-symbols-outlined text-[14px]">info</span>
          Setelah invoice pertama dipilih, invoice dengan rekening tujuan berbeda dinonaktifkan dari voucher ini.
        </p>
      </section>

      {/* Sticky selection summary */}
      <div className="sticky bottom-0 z-30 -mb-6 rounded-t-lg border border-b-0 border-border bg-surface/95 shadow-[0_-4px_12px_rgb(15_23_42/8%)] backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0 text-xs">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-primary">receipt</span>
              <strong>{selectedInvoices.length} invoice dipilih</strong>
              <span className="text-text-disabled">•</span>
              Total Nominal: <strong className="font-mono text-sm text-primary">{formatRupiah(total)}</strong>
            </p>
            {selectedInvoices[0] && (
              <p className="mt-0.5 truncate text-text-secondary">
                Rekening tujuan: <span className="font-mono">{selectedInvoices[0].bank_account}</span> ({selectedInvoices[0].vendor_name})
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => setSelected([])}
              className="h-10 rounded px-4 text-xs font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50"
            >
              Reset Pilihan
            </button>
            <button
              type="button"
              disabled={selectedInvoices.length === 0}
              onClick={goPreview}
              title={!purposeText ? "Isi Peruntukan terlebih dahulu" : undefined}
              className="flex h-10 items-center gap-1.5 rounded bg-primary px-5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-border-strong"
            >
              Lanjut ke Preview Voucher
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {viewing && <FileViewerModal invoiceId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-text-primary">
        {label} <span className="text-danger">*</span>
      </label>
      {children}
      <p className="mt-1 text-[11px] text-text-secondary">{hint}</p>
    </div>
  );
}

function EmptyState({ icon, title, message, action }: { icon: string; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-secondary">
        <span aria-hidden="true" className="material-symbols-outlined text-[24px]">{icon}</span>
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-text-secondary">{message}</p>
      {action}
    </div>
  );
}

/** Confirmation after a successful save (UC-2 step 9) with the optional download (UC-9). */
function VoucherCreated({ voucher: created, onStartOver }: { voucher: VoucherDetail; onStartOver: () => void }) {
  // A first download changes the status; keep the panel in sync with the returned voucher.
  const [voucher, setVoucher] = useState(created);
  return (
    <div className="mx-auto w-full max-w-[720px] overflow-hidden rounded-lg border border-border bg-surface shadow-md">
      <div className="h-1.5 bg-success" />
      <div className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
            <span aria-hidden="true" className="material-symbols-outlined text-[28px]">check</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">Voucher berhasil dibuat</h1>
            <p className="mt-0.5 text-xs text-text-secondary">
              Voucher tersimpan dan terkunci. {voucher.invoices.length} invoice berubah menjadi VOUCHERED.
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-lg border border-border bg-surface-muted p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Nomor Voucher</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-2xl font-bold text-primary">{voucher.voucher_number}</p>
            <VoucherStatusChip status={voucher.status} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <Meta label="Klien" value={voucher.client.name} />
          <Meta label="Vendor" value={voucher.vendor_name} />
          <Meta label="Rekening tujuan" value={voucher.bank_account} mono />
          <Meta label="Nominal" value={formatRupiah(voucher.total_amount)} mono />
          <div className="sm:col-span-2"><Meta label="Peruntukan" value={voucher.purpose} /></div>
        </dl>
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Link href={`/vouchers/${voucher.id}`} className="flex h-10 items-center rounded border border-border px-4 text-xs font-semibold text-text-primary no-underline hover:bg-surface-muted">
              Lihat Detail
            </Link>
            <button type="button" onClick={onStartOver} className="flex h-10 items-center gap-1.5 rounded border border-border px-4 text-xs font-semibold text-text-primary hover:bg-surface-muted">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_card</span>
              Buat Voucher Lain
            </button>
          </div>
          <DownloadVoucherButton voucherId={voucher.id} status={voucher.status} onDownloaded={setVoucher} />
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`font-semibold text-text-primary ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
