"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AssignedClient, EligibleInvoice, InvoiceDetail, invoiceService } from "@/lib/api";
import { formatDate, formatQuantity, formatRupiah, todayIso } from "@/lib/format";

/**
 * Step 2 of Buat Voucher (VCH-06), following templates/voucher-create-preview.html: the selected
 * invoices on the left and a read-only A4 preview on the right. The voucher number is allocated by
 * the backend on save, so the preview shows a placeholder.
 */
export default function VoucherPreview({
  client,
  vendorName,
  invoices,
  purpose,
  banner,
  creating,
  onBack,
  onSubmit,
  onViewFile,
  viewer,
}: {
  client: AssignedClient;
  vendorName: string;
  invoices: EligibleInvoice[];
  purpose: string;
  banner: React.ReactNode;
  creating: boolean;
  onBack: () => void;
  onSubmit: () => void;
  onViewFile: (invoiceId: string) => void;
  viewer: React.ReactNode;
}) {
  // Line items are not in the eligible list; load each invoice's detail for the preview table.
  const [details, setDetails] = useState<Record<string, InvoiceDetail> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const idsKey = invoices.map((invoice) => invoice.id).join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all(idsKey.split(",").map((id) => invoiceService.get(id))).then(
      (list) => !cancelled && setDetails(Object.fromEntries(list.map((detail) => [detail.id, detail]))),
      (err) => !cancelled && setDetailError(err instanceof Error ? err.message : "Rincian invoice tidak dapat dimuat."),
    );
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  const sum = (pick: (invoice: EligibleInvoice) => string | null) =>
    invoices.reduce((total, invoice) => total + Number(pick(invoice) ?? 0), 0);
  const total = sum((invoice) => invoice.total_amount);
  const tax = sum((invoice) => invoice.tax_amount);
  const discount = sum((invoice) => invoice.discount_amount);
  const subtotal = total - tax + discount;
  const bank = invoices[0]?.bank_account ?? "-";

  return (
    <div className="mx-auto flex w-full max-w-[1366px] flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs">
            <Link href="/invoices" className="text-text-secondary no-underline hover:text-text-primary">Menu Intake</Link>
            <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span>
            <button type="button" onClick={onBack} className="text-text-secondary hover:text-text-primary">Buat Voucher</button>
            <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span>
            <span className="font-semibold text-text-primary">Pratinjau</span>
          </nav>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Pratinjau Dokumen Voucher</h1>
          <p className="text-xs text-text-secondary">Langkah 2 dari 2: periksa kembali sebelum voucher dibuat secara permanen.</p>
        </div>
        <ol className="flex items-center gap-2 text-xs font-semibold">
          <li className="flex items-center gap-1.5 text-success">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-subtle">✓</span>1. Pilih Invoice
          </li>
          <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-text-disabled">arrow_forward</span>
          <li className="flex items-center gap-1.5 text-primary" aria-current="step">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">2</span>2. Pratinjau Voucher
          </li>
        </ol>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs shadow-sm">
        <span>Klien: <strong>{client.name}</strong></span>
        <span className="text-text-disabled">•</span>
        <span>Vendor: <strong>{vendorName}</strong></span>
        <span className="text-text-disabled">•</span>
        <span>Rekening Tujuan: <strong className="font-mono">{bank}</strong></span>
      </div>

      {banner}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: selection summary */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <h2 className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">receipt_long</span>
                Ringkasan Invoice Terpilih
              </span>
              <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] text-primary">{invoices.length} Dokumen</span>
            </h2>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  <th className="px-4 py-2">No. Invoice</th>
                  <th className="px-2 py-2">Tanggal</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="py-2 pl-2 pr-4 text-right">Berkas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-muted">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-4 py-2.5">
                      <p className="font-mono font-semibold">{invoice.invoice_number ?? "-"}</p>
                      <p className="text-[11px] text-text-secondary">{invoice.item_count} rincian barang</p>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">{formatDate(invoice.invoice_date)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono font-semibold">{formatRupiah(invoice.total_amount)}</td>
                    <td className="py-2.5 pl-2 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => onViewFile(invoice.id)}
                        aria-label={`Lihat file asli ${invoice.original_filename}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-primary hover:bg-primary-subtle"
                      >
                        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1 border-t border-border bg-surface-muted px-4 py-3 text-xs">
              <Row label="Akumulasi Subtotal" value={formatRupiah(subtotal)} />
              <Row label="Akumulasi Diskon" value={formatRupiah(-discount)} />
              <Row label="Akumulasi Pajak" value={formatRupiah(tax)} />
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm">
                <dt className="font-semibold">Total Nominal</dt>
                <dd className="font-mono font-bold text-primary">{formatRupiah(total)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">description</span>
              Peruntukan Voucher
            </h2>
            <p className="rounded bg-surface-muted px-3 py-2 text-sm italic">“{purpose}”</p>
          </section>

          <p className="flex items-start gap-2 rounded-lg border border-status-ready-border bg-status-ready-bg px-4 py-3 text-xs text-status-ready-fg">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">verified_user</span>
            Setelah &quot;Buat voucher&quot;, voucher terkunci dan semua invoice di dalamnya berubah menjadi VOUCHERED. Voucher tidak dapat diedit atau dibatalkan.
          </p>
        </div>

        {/* Right: read-only A4 preview */}
        <div className="lg:col-span-7">
          <article aria-label="Pratinjau voucher" className="relative overflow-hidden rounded-sm border border-border bg-white p-6 shadow-md sm:p-8">
            <span className="absolute right-0 top-4 rounded-l bg-warning-subtle px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-warning">
              Template sementara
            </span>
            <p className="text-[11px] text-text-secondary">{client.name}</p>
            <h2 className="mt-1 border-b-2 border-primary pb-2 text-lg font-bold text-primary">VOUCHER PEMBAYARAN</h2>

            <dl className="mt-4 grid grid-cols-[120px_1fr] border border-border text-xs">
              <PaperRow label="Nomor" value={<span className="italic text-text-secondary">[ Akan dibuat otomatis ]</span>} />
              <PaperRow label="Tanggal" value={formatDate(todayIso())} />
              <PaperRow label="Nama" value={vendorName} />
              <PaperRow label="Rekening tujuan" value={<span className="font-mono">{bank}</span>} />
              <PaperRow label="Peruntukan" value={purpose} />
              <PaperRow label="Nominal" value={<span className="font-mono text-sm font-bold text-primary">{formatRupiah(total)}</span>} last />
            </dl>

            <h3 className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Tabel Invoice Items</h3>
            {detailError ? (
              <p className="rounded border border-danger bg-danger-subtle px-3 py-2 text-xs text-status-rejected-fg">{detailError}</p>
            ) : !details ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-6 animate-pulse rounded bg-surface-muted" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border border-border text-left text-[11px]">
                  <thead>
                    <tr className="bg-primary text-white">
                      <th className="px-2 py-1.5">Nomor Invoice</th>
                      <th className="px-2 py-1.5">No</th>
                      <th className="px-2 py-1.5">Deskripsi</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5 text-right">Harga Satuan</th>
                      <th className="px-2 py-1.5 text-right">Jumlah</th>
                    </tr>
                  </thead>
                  {invoices.map((invoice) => {
                    const detail = details[invoice.id];
                    const items = detail?.items ?? [];
                    return (
                      <tbody key={invoice.id} className="border-b border-border">
                        {items.map((item, index) => (
                          <tr key={item.line_no} className="align-top">
                            <td className="px-2 py-1 font-mono">{index === 0 ? invoice.invoice_number ?? "-" : ""}</td>
                            <td className="px-2 py-1">{item.line_no}</td>
                            <td className="px-2 py-1">{item.description ?? "-"}</td>
                            <td className="px-2 py-1 text-right">{formatQuantity(item.quantity)}</td>
                            <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{formatRupiah(item.unit_price)}</td>
                            <td className="whitespace-nowrap px-2 py-1 text-right font-mono">{formatRupiah(item.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-surface-muted">
                          <td colSpan={5} className="px-2 py-1 text-right text-text-secondary">
                            Subtotal {formatRupiah(detail?.subtotal_amount ?? null)} · Diskon {formatRupiah(invoice.discount_amount)} · Pajak {formatRupiah(invoice.tax_amount ?? 0)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right font-mono font-semibold">{formatRupiah(invoice.total_amount)}</td>
                        </tr>
                      </tbody>
                    );
                  })}
                  <tfoot>
                    <tr className="border-t-2 border-primary">
                      <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">Nominal voucher</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono font-bold">{formatRupiah(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </article>
        </div>
      </div>

      <div className="sticky bottom-0 z-30 -mb-6 flex flex-col gap-2 rounded-t-lg border border-b-0 border-border bg-surface/95 px-4 py-3 shadow-[0_-4px_12px_rgb(15_23_42/8%)] backdrop-blur sm:flex-row sm:items-center sm:justify-end sm:px-5">
        <button
          type="button"
          disabled={creating}
          onClick={onBack}
          className="flex h-10 items-center justify-center gap-1.5 rounded border border-border px-4 text-xs font-semibold text-text-primary hover:bg-surface-muted disabled:opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
          Ubah pilihan
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={onSubmit}
          className="flex h-10 items-center justify-center gap-1.5 rounded bg-primary px-5 text-xs font-semibold text-white shadow-sm hover:bg-primary-hover disabled:cursor-wait disabled:opacity-70"
        >
          {creating ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">post_add</span>
          )}
          {creating ? "Menyimpan voucher..." : "Buat voucher"}
        </button>
      </div>

      {viewer}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function PaperRow({ label, value, last = false }: { label: string; value: React.ReactNode; last?: boolean }) {
  const border = last ? "" : "border-b border-border";
  return (
    <>
      <dt className={`bg-surface-muted px-3 py-1.5 font-semibold text-text-secondary ${border}`}>{label}</dt>
      <dd className={`px-3 py-1.5 ${border}`}>{value}</dd>
    </>
  );
}
