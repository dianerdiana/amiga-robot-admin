"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VoucherDetail, errorStatus, voucherService } from "@/lib/api";
import { formatDate, formatDateTime, formatQuantity, formatRupiah } from "@/lib/format";
import { ErrorBanner, ForbiddenState, PageSpinner } from "@/components/invoices/States";
import { StatusBadge } from "@/components/invoices/StatusBadge";
import DownloadVoucherButton from "./DownloadVoucherButton";
import { VoucherStatusChip } from "./meta";

/**
 * Voucher detail (UC-10 step 3): read-only data, every invoice with its line items, and the
 * download (UC-9). Vouchers are locked after creation (VCH-09), so nothing here is editable.
 */
export default function VoucherDetailView({ voucherId }: { voucherId: string }) {
  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "missing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  /** State is only updated in promise callbacks. */
  const load = useCallback(
    () =>
      voucherService.get(voucherId).then(
        (detail) => {
          setVoucher(detail);
          setStatus("ready");
          setError(null);
        },
        (err) => {
          const code = errorStatus(err);
          if (code === 403) setStatus("forbidden");
          else if (code === 404 || code === 422) setStatus("missing");
          else {
            setStatus("error");
            setError(err instanceof Error ? err.message : "Voucher tidak dapat dimuat.");
          }
        },
      ),
    [voucherId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") return <PageSpinner label="Memuat detail voucher..." />;
  if (status === "forbidden") {
    return <ForbiddenState backHref="/vouchers" message="Anda tidak memiliki akses ke voucher ini. Klien tidak ditugaskan kepada Anda atau penugasan telah dicabut." />;
  }
  if (status === "missing") {
    return <ForbiddenState backHref="/vouchers" message="Voucher tidak ditemukan. Buka kembali dari Daftar Voucher." />;
  }
  if (!voucher) {
    return <ErrorBanner title="Voucher tidak dapat dimuat" message={error ?? "Terjadi kesalahan."} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1 text-xs">
            <Link href="/vouchers" className="text-text-secondary no-underline hover:text-text-primary">Daftar Voucher</Link>
            <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span>
            <span className="font-mono font-semibold text-text-primary">{voucher.voucher_number}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-bold text-primary sm:text-2xl">{voucher.voucher_number}</h1>
            <VoucherStatusChip status={voucher.status} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px]">lock</span>
            Voucher terkunci: tidak dapat diedit atau dibatalkan.
          </p>
        </div>
        <DownloadVoucherButton voucherId={voucher.id} status={voucher.status} onDownloaded={setVoucher} />
      </header>

      <section className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Klien" value={voucher.client.name} />
          <Field label="Nama (Vendor)" value={voucher.vendor_name} />
          <Field label="Rekening tujuan" value={voucher.bank_account} mono />
          <Field label="Tanggal dibuat" value={`${formatDateTime(voucher.created_at)} oleh ${voucher.created_by.name}`} />
          <Field label="Diunduh pertama" value={voucher.sent_at ? formatDateTime(voucher.sent_at) : "Belum diunduh"} />
          <Field label="Nominal" value={formatRupiah(voucher.total_amount)} mono strong />
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Peruntukan" value={voucher.purpose} />
          </div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <h2 className="flex items-center justify-between border-b border-border px-4 py-3 text-sm font-semibold sm:px-5">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">receipt_long</span>
            Invoice dalam Voucher
          </span>
          <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] text-primary">{voucher.invoices.length} Dokumen</span>
        </h2>
        <div className="divide-y divide-border">
          {voucher.invoices.map((invoice) => {
            const subtotal = invoice.items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
            return (
              <article key={invoice.id} className="px-4 py-4 sm:px-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-mono text-sm font-semibold">{invoice.invoice_number ?? "-"}</span>
                    <span className="text-text-secondary">{formatDate(invoice.invoice_date)}</span>
                    <Link href={`/invoices/${invoice.id}`} className="font-mono text-primary no-underline hover:underline">
                      {invoice.request_id}
                    </Link>
                  </div>
                  <StatusBadge status={invoice.status} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border border-border text-left text-xs">
                    <thead>
                      <tr className="bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                        <th className="w-12 px-3 py-2">No</th>
                        <th className="px-3 py-2">Deskripsi</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Harga Satuan</th>
                        <th className="px-3 py-2 text-right">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-muted">
                      {invoice.items.map((item) => (
                        <tr key={item.line_no}>
                          <td className="px-3 py-1.5">{item.line_no}</td>
                          <td className="px-3 py-1.5">{item.description ?? "-"}</td>
                          <td className="px-3 py-1.5 text-right">{formatQuantity(item.quantity)}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatRupiah(item.unit_price)}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatRupiah(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-surface-muted">
                      <tr>
                        <td colSpan={4} className="px-3 py-1.5 text-right text-text-secondary">
                          Subtotal {formatRupiah(subtotal)} · Diskon {formatRupiah(invoice.discount_amount)} · Pajak {formatRupiah(invoice.tax_amount ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-semibold">{formatRupiah(invoice.total_amount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-3 border-t-2 border-primary px-4 py-3 text-sm sm:px-5">
          <span className="font-semibold">Nominal voucher</span>
          <span className="font-mono font-bold text-primary">{formatRupiah(voucher.total_amount)}</span>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, mono = false, strong = false }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div>
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${mono ? "font-mono" : ""} ${strong ? "text-sm text-primary" : "text-text-primary"}`}>{value}</dd>
    </div>
  );
}
