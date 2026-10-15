"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssignedClient, VoucherDetail, VoucherPage, errorStatus, invoiceService, voucherService } from "@/lib/api";
import { formatDate, formatRupiah } from "@/lib/format";
import { FilterSelect, PageButton, pageNumbers } from "@/components/invoices/InvoiceQueue";
import { ErrorBanner, ForbiddenState } from "@/components/invoices/States";
import DownloadVoucherButton from "./DownloadVoucherButton";
import { VoucherStatusChip } from "./meta";

const PAGE_SIZE = 20;
const COLUMNS = ["Nomor Voucher", "Tanggal", "Klien", "Vendor", "Peruntukan", "Invoice", "Nominal", "Status", "Aksi"];

/**
 * Daftar Voucher (UC-10, VCH-13): vouchers of the assigned clients, newest first, with detail and
 * download (UC-9). A download updates the row's status in place without reloading the page.
 */
export default function VoucherList() {
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ key: string; page: VoucherPage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const requestSeq = useRef(0);

  const query = useMemo(
    () => ({ client_id: clientId || undefined, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
    [clientId, page],
  );
  const queryKey = JSON.stringify(query);

  /** State is only updated in callbacks, so a stale response never overwrites a newer one. */
  const fetchPage = useCallback(() => {
    const seq = ++requestSeq.current;
    return voucherService.list(query).then(
      (result) => {
        if (seq !== requestSeq.current) return;
        setData({ key: queryKey, page: result });
        setError(null);
        setForbidden(false);
      },
      (err) => {
        if (seq !== requestSeq.current) return;
        if (errorStatus(err) === 403) setForbidden(true);
        else setError(err instanceof Error ? err.message : "Daftar voucher tidak dapat dimuat.");
      },
    );
  }, [query, queryKey]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  useEffect(() => {
    invoiceService.assignedClients().then(setClients, () => setClients([]));
  }, []);

  /** Reflect a first download (SENT_TO_CLIENT) in the current page. */
  const applyDownload = (voucher: VoucherDetail) =>
    setData((current) =>
      current && {
        ...current,
        page: {
          ...current.page,
          items: current.page.items.map((row) => (row.id === voucher.id ? { ...row, status: voucher.status } : row)),
        },
      },
    );

  const loading = data?.key !== queryKey;
  const rows = data?.page.items ?? [];
  const total = data?.page.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showSkeleton = loading && !data;

  return (
    <div className="mx-auto w-full max-w-[1366px]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex max-w-2xl items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[24px]">payments</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Daftar Voucher</h1>
            <p className="mt-0.5 text-xs text-text-secondary sm:text-sm">
              Voucher pembayaran dari klien yang ditugaskan kepada Anda. Voucher terkunci setelah dibuat.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchPage()}
            className="flex h-9 items-center gap-1.5 rounded border border-border bg-surface px-3 text-xs font-semibold text-text-primary shadow-sm hover:bg-surface-muted"
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${loading && data ? "animate-spin" : ""}`}>refresh</span>
            Segarkan
          </button>
          <Link
            href="/vouchers/new"
            className="flex h-9 items-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold text-white no-underline shadow-sm hover:bg-primary-hover"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_card</span>
            Buat Voucher
          </Link>
        </div>
      </div>

      {forbidden ? (
        <ForbiddenState message="Anda tidak memiliki akses ke daftar voucher klien ini." />
      ) : (
        <>
          {error && <ErrorBanner title="Daftar voucher tidak dapat dimuat" message={error} onRetry={() => void fetchPage()} />}

          <div className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="voucherFilterKlien"
              label="Klien Ditugaskan"
              value={clientId}
              onChange={(value) => {
                setClientId(value);
                setPage(1);
              }}
              options={[
                { value: "", label: `Semua Ditugaskan (${clients.length} Klien)` },
                ...clients.map((client) => ({ value: client.id, label: client.name })),
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            {!showSkeleton && rows.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-text-secondary">
                  <span aria-hidden="true" className="material-symbols-outlined text-[24px]">receipt_long</span>
                </div>
                <h2 className="text-sm font-semibold">Belum ada voucher</h2>
                <p className="mt-1 max-w-md text-xs text-text-secondary">
                  Voucher muncul di sini setelah dibuat dari invoice berstatus AMIGA_REVIEWED.
                </p>
                <Link
                  href="/vouchers/new"
                  className="mt-4 flex h-9 items-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold text-white no-underline hover:bg-primary-hover"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add_card</span>
                  Buat Voucher
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse text-left">
                  <thead>
                    <tr className="h-10 border-b border-border bg-surface-muted">
                      {COLUMNS.map((heading) => (
                        <th
                          key={heading}
                          className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary first:pl-4 last:pr-4 ${
                            heading === "Nominal" || heading === "Invoice" || heading === "Aksi" ? "text-right" : ""
                          }`}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-muted text-xs">
                    {showSkeleton
                      ? Array.from({ length: 6 }).map((_, index) => (
                          <tr key={index} className="h-11 animate-pulse">
                            <td colSpan={COLUMNS.length} className="px-4">
                              <div className="h-5 rounded bg-surface-muted" />
                            </td>
                          </tr>
                        ))
                      : rows.map((voucher) => (
                            <tr key={voucher.id} className="h-12 hover:bg-primary-subtle/30">
                              <td className="whitespace-nowrap py-2 pl-4 pr-3">
                                <Link href={`/vouchers/${voucher.id}`} className="font-mono text-[13px] font-semibold text-primary no-underline hover:underline">
                                  {voucher.voucher_number}
                                </Link>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDate(voucher.created_at)}</td>
                              <td className="px-3 py-2">{voucher.client.name}</td>
                              <td className="px-3 py-2 font-medium">{voucher.vendor_name}</td>
                              <td className="max-w-[280px] truncate px-3 py-2 text-text-secondary" title={voucher.purpose}>{voucher.purpose}</td>
                              <td className="px-3 py-2 text-right font-mono">{voucher.invoice_count}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums">{formatRupiah(voucher.total_amount)}</td>
                              <td className="px-3 py-2"><VoucherStatusChip status={voucher.status} /></td>
                              <td className="py-2 pl-3 pr-4">
                                <div className="flex items-start justify-end gap-1.5">
                                  <Link
                                    href={`/vouchers/${voucher.id}`}
                                    aria-label={`Lihat voucher ${voucher.voucher_number}`}
                                    className="inline-flex h-8 items-center gap-1 rounded border border-border bg-surface px-2.5 text-xs font-semibold text-text-primary no-underline hover:bg-surface-muted"
                                  >
                                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">visibility</span>
                                    Lihat
                                  </Link>
                                  <DownloadVoucherButton compact voucherId={voucher.id} status={voucher.status} onDownloaded={applyDownload} />
                                </div>
                              </td>
                            </tr>
                          ))}
                  </tbody>
                </table>
              </div>
            )}

            {!showSkeleton && total > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3 text-xs text-text-secondary sm:flex-row">
                <span>
                  Menampilkan{" "}
                  <strong className="text-text-primary">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
                  </strong>{" "}
                  dari <strong className="text-text-primary">{total}</strong> voucher
                </span>
                <nav aria-label="Paginasi" className="flex items-center gap-1">
                  <PageButton disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_left</span>
                    <span className="hidden sm:inline">Sebelumnya</span>
                  </PageButton>
                  {pageNumbers(page, pageCount).map((value, index) =>
                    value === null ? (
                      <span key={`gap-${index}`} className="px-1">…</span>
                    ) : (
                      <PageButton key={value} active={value === page} onClick={() => setPage(value)}>
                        {value}
                      </PageButton>
                    ),
                  )}
                  <PageButton disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                    <span className="hidden sm:inline">Berikutnya</span>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
                  </PageButton>
                </nav>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
