"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssignedClient, InvoicePage, InvoiceStatus, errorStatus, invoiceService } from "@/lib/api";
import { formatDate, formatRupiah } from "@/lib/format";
import { ErrorBanner, ForbiddenState } from "./States";
import { IssueSummary, StatusBadge } from "./StatusBadge";
import { INVOICE_STATUSES, ISSUE_FILTERS, ISSUE_FILTER_LABELS, STATUS_META, isProcessing } from "./meta";

const PAGE_SIZES = [20, 50, 100];
const POLL_INTERVAL_MS = 3000;
const COLUMNS = ["Request ID", "Klien", "Vendor", "No. Invoice", "Total", "Status", "Tanggal", "Kendala", "Aksi"];

type FilterKey = "client" | "status" | "issue" | "from" | "to";

/** Invoice queue for Intake (QUE-01, QUE-02), following templates/invoioce-list.html. */
export default function InvoiceQueue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<AssignedClient[]>([]);
  const [data, setData] = useState<{ key: string; page: InvoicePage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestSeq = useRef(0);

  const filters = useMemo(
    () => ({
      client: searchParams.get("client") ?? "",
      status: searchParams.get("status") ?? "",
      issue: searchParams.get("issue") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    }),
    [searchParams],
  );
  const limit = PAGE_SIZES.includes(Number(searchParams.get("limit"))) ? Number(searchParams.get("limit")) : 20;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const query = useMemo(
    () => ({
      client_id: filters.client || undefined,
      status: (filters.status || undefined) as InvoiceStatus | undefined,
      issue: filters.issue || undefined,
      date_from: filters.from || undefined,
      date_to: filters.to || undefined,
      skip: (page - 1) * limit,
      limit,
    }),
    [filters, limit, page],
  );
  const queryKey = JSON.stringify(query);

  const updateParams = useCallback(
    (updates: Record<string, string | number | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") next.delete(key);
        else next.set(key, String(value));
      });
      if (resetPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `/invoices?${qs}` : "/invoices", { scroll: false });
    },
    [router, searchParams],
  );

  /** Fetch one queue page; state is only updated in callbacks so stale responses are ignored. */
  const fetchPage = useCallback(
    (silent: boolean) => {
      const seq = ++requestSeq.current;
      return invoiceService.list(query).then(
        (result) => {
          if (seq !== requestSeq.current) return;
          setData({ key: queryKey, page: result });
          setError(null);
          setForbidden(false);
        },
        (err) => {
          if (seq !== requestSeq.current) return;
          if (errorStatus(err) === 403) setForbidden(true);
          else if (!silent) setError(err instanceof Error ? err.message : "Antrean tidak dapat dimuat.");
        },
      );
    },
    [query, queryKey],
  );

  useEffect(() => {
    void fetchPage(false);
  }, [fetchPage]);

  useEffect(() => {
    invoiceService.assignedClients().then(setClients).catch(() => setClients([]));
  }, []);

  // Extraction runs in the background: refresh silently while any visible invoice is still processing.
  const hasActiveRows = data?.page.items.some((item) => isProcessing(item.status)) ?? false;
  useEffect(() => {
    if (!hasActiveRows) return;
    const timer = window.setInterval(() => void fetchPage(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveRows, fetchPage]);

  const refresh = () => {
    setRefreshing(true);
    void fetchPage(false).finally(() => setRefreshing(false));
  };
  const loading = data?.key !== queryKey && !error && !forbidden;

  const clientLabel = (id: string) => {
    const client = clients.find((c) => c.id === id);
    return client ? client.name : "Klien";
  };
  const activeChips: { key: FilterKey | "range"; label: string }[] = [
    filters.client && { key: "client" as const, label: `Klien: ${clientLabel(filters.client)}` },
    filters.status && { key: "status" as const, label: `Status: ${STATUS_META[filters.status as InvoiceStatus]?.filterLabel ?? filters.status}` },
    filters.issue && { key: "issue" as const, label: `Kendala: ${ISSUE_FILTER_LABELS[filters.issue] ?? filters.issue}` },
    (filters.from || filters.to) && {
      key: "range" as const,
      label: `Tanggal: ${filters.from ? formatDate(filters.from) : "…"} - ${filters.to ? formatDate(filters.to) : "…"}`,
    },
  ].filter(Boolean) as { key: FilterKey | "range"; label: string }[];

  const total = data?.page.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const rows = data?.page.items ?? [];
  const showSkeleton = loading && !data;

  return (
    <div className="flex w-full flex-col pb-8">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-text-secondary">
        <span>Menu Intake</span>
        <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-text-disabled">chevron_right</span>
        <span className="font-semibold text-text-primary">Antrean</span>
      </nav>

      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex max-w-2xl items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[24px]">receipt_long</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Antrean</h1>
            <p className="mt-0.5 text-xs text-text-secondary sm:text-sm">
              Pantau status ekstraksi dan hasil review invoice dari klien yang ditugaskan kepada Anda.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="flex h-9 items-center gap-1.5 rounded border border-border bg-surface px-3 text-xs font-semibold text-text-primary shadow-sm hover:bg-surface-muted"
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[18px] ${refreshing || (loading && data) ? "animate-spin" : ""}`}>refresh</span>
            Segarkan
          </button>
          <Link
            href="/invoices/upload"
            className="flex h-9 items-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold text-white no-underline shadow-sm hover:bg-primary-hover"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
            Upload Invoice
          </Link>
        </div>
      </div>

      {forbidden ? (
        <ForbiddenState message="Anda tidak memiliki izin untuk membuka antrean klien ini. Silakan hubungi koordinator Intake." />
      ) : (
        <>
          {error && <ErrorBanner title="Antrean tidak dapat dimuat" message={error} onRetry={refresh} />}

          {/* Filter bar */}
          <div className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              id="filterKlien"
              label="Klien Ditugaskan"
              value={filters.client}
              onChange={(value) => updateParams({ client: value })}
              options={[
                { value: "", label: `Semua Ditugaskan (${clients.length} Klien)` },
                ...clients.map((client) => ({
                  value: client.id,
                  label: `${client.name}${client.has_reviewer ? "" : " (Belum ada reviewer)"}`,
                })),
              ]}
            />
            <FilterSelect
              id="filterStatus"
              label="Status Dokumen"
              value={filters.status}
              onChange={(value) => updateParams({ status: value })}
              options={[
                { value: "", label: "Semua Status" },
                ...INVOICE_STATUSES.map((status) => ({ value: status, label: STATUS_META[status].filterLabel })),
              ]}
            />
            <FilterSelect
              id="filterKendala"
              label="Jenis Kendala"
              value={filters.issue}
              onChange={(value) => updateParams({ issue: value })}
              options={[
                { value: "", label: "Semua Kendala" },
                ...ISSUE_FILTERS.map((code) => ({ value: code, label: ISSUE_FILTER_LABELS[code] })),
              ]}
            />
            <fieldset>
              <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Rentang Tanggal</legend>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  aria-label="Tanggal mulai"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(event) => updateParams({ from: event.target.value })}
                  className="h-9 w-full min-w-0 rounded border border-border-strong bg-white px-2 text-xs focus:ring-2 focus:ring-focus-ring"
                />
                <span className="text-xs text-text-disabled">-</span>
                <input
                  type="date"
                  aria-label="Tanggal akhir"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(event) => updateParams({ to: event.target.value })}
                  className="h-9 w-full min-w-0 rounded border border-border-strong bg-white px-2 text-xs focus:ring-2 focus:ring-focus-ring"
                />
              </div>
            </fieldset>
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-text-secondary">Filter Aktif:</span>
              {activeChips.map((chip) => (
                <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-status-vouchered-border bg-primary-subtle py-0.5 pl-2.5 pr-1 font-medium text-primary">
                  {chip.label}
                  <button
                    type="button"
                    title="Hapus filter"
                    onClick={() => updateParams(chip.key === "range" ? { from: null, to: null } : { [chip.key]: null })}
                    className="rounded-full p-0.5 hover:bg-white/70"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => updateParams({ client: null, status: null, issue: null, from: null, to: null })}
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-semibold text-text-link hover:bg-surface-muted"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[16px]">restart_alt</span>
                Reset Filter
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="h-10 border-b border-border bg-surface-muted">
                    {COLUMNS.map((heading, index) => (
                      <th
                        key={heading}
                        className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary ${
                          index === 0 ? "sticky left-0 z-10 bg-surface-muted pl-4" : ""
                        } ${heading === "Total" ? "text-right" : ""} ${heading === "Aksi" ? "pr-4 text-right" : ""}`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-muted text-xs">
                  {showSkeleton
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <tr key={index} className="h-11 animate-pulse">
                          <td colSpan={COLUMNS.length} className="px-4">
                            <div className="h-5 rounded bg-surface-muted" />
                          </td>
                        </tr>
                      ))
                    : rows.map((invoice) => (
                        <tr key={invoice.id} className="group h-11 transition-colors hover:bg-primary-subtle/40">
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-surface py-2.5 pl-4 pr-3 font-mono text-[13px] font-semibold text-primary shadow-[2px_0_4px_rgb(15_23_42/4%)] group-hover:bg-primary-subtle">
                            {invoice.request_id}
                          </td>
                          <td className="px-3 py-2 text-text-primary">{invoice.client.name}</td>
                          <td className="px-3 py-2 font-medium text-text-primary">{invoice.vendor_name ?? <span className="text-text-disabled">-</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-text-secondary">{invoice.invoice_number ?? "-"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold tabular-nums">{formatRupiah(invoice.total_amount)}</td>
                          <td className="px-3 py-2"><StatusBadge status={invoice.status} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{formatDate(invoice.request_date)}</td>
                          <td className="px-3 py-2"><IssueSummary codes={invoice.exception_codes} hasReviewer={invoice.has_reviewer} /></td>
                          <td className="py-2 pl-3 pr-4 text-right">
                            <Link
                              href={`/invoices/${invoice.id}`}
                              aria-label={`Lihat request ${invoice.request_id}`}
                              className="inline-flex h-8 items-center gap-1 rounded border border-border bg-surface px-3 text-xs font-semibold text-primary no-underline hover:border-primary hover:bg-primary-subtle"
                            >
                              Periksa
                            </Link>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card stack */}
            <div className="divide-y divide-border md:hidden">
              {showSkeleton
                ? Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="animate-pulse space-y-2 p-4">
                      <div className="h-4 w-1/2 rounded bg-surface-muted" />
                      <div className="h-16 rounded bg-surface-muted" />
                    </div>
                  ))
                : rows.map((invoice) => (
                    <div key={invoice.id} className="p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <span className="font-mono text-[13px] font-semibold text-primary">{invoice.request_id}</span>
                        <StatusBadge status={invoice.status} />
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <MobileField label="Klien" value={invoice.client.name} />
                        <MobileField label="Vendor" value={invoice.vendor_name ?? "-"} />
                        <MobileField label="No. Invoice" value={invoice.invoice_number ?? "-"} mono />
                        <MobileField label="Tanggal" value={formatDate(invoice.request_date)} />
                      </dl>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-surface-muted pt-3">
                        <div className="text-xs">
                          <span className="text-text-secondary">Total: </span>
                          <span className="font-mono font-semibold">{formatRupiah(invoice.total_amount)}</span>
                        </div>
                        <IssueSummary codes={invoice.exception_codes} hasReviewer={invoice.has_reviewer} />
                      </div>
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="mt-3 flex h-10 w-full items-center justify-center rounded border border-border text-xs font-semibold text-primary no-underline hover:bg-primary-subtle"
                      >
                        Periksa Dokumen
                      </Link>
                    </div>
                  ))}
            </div>

            {!showSkeleton && rows.length === 0 && (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <span aria-hidden="true" className="material-symbols-outlined mb-2 text-[40px] text-text-disabled">folder_open</span>
                <h3 className="text-sm font-semibold">Belum ada request</h3>
                <p className="mt-1 max-w-sm text-xs text-text-secondary">
                  {activeChips.length
                    ? "Tidak ada dokumen invoice yang cocok dengan kriteria filter aktif saat ini."
                    : "Invoice yang Anda unggah akan muncul di sini beserta status ekstraksinya."}
                </p>
                {activeChips.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => updateParams({ client: null, status: null, issue: null, from: null, to: null })}
                    className="mt-4 h-9 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted"
                  >
                    Reset Semua Filter
                  </button>
                ) : (
                  <Link href="/invoices/upload" className="mt-4 inline-flex h-9 items-center rounded bg-primary px-4 text-xs font-semibold text-white no-underline hover:bg-primary-hover">
                    Upload Invoice
                  </Link>
                )}
              </div>
            )}

            {/* Server-side pagination */}
            {!showSkeleton && total > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-border bg-surface-muted px-4 py-3 text-xs text-text-secondary sm:flex-row">
                <div className="flex items-center gap-2">
                  <span>
                    Menampilkan{" "}
                    <strong className="text-text-primary">
                      {(page - 1) * limit + 1}–{Math.min(page * limit, total)}
                    </strong>{" "}
                    dari <strong className="text-text-primary">{total}</strong>
                  </span>
                  <span aria-hidden="true">•</span>
                  <label className="flex items-center gap-1.5">
                    Baris per halaman:
                    <select
                      value={limit}
                      onChange={(event) => updateParams({ limit: event.target.value === "20" ? null : event.target.value })}
                      className="h-7 rounded border border-border bg-white px-1.5 text-xs"
                    >
                      {PAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <nav aria-label="Paginasi" className="flex items-center gap-1">
                  <PageButton disabled={page <= 1} onClick={() => updateParams({ page: page - 1 }, false)}>
                    <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_left</span>
                    <span className="hidden sm:inline">Sebelumnya</span>
                  </PageButton>
                  {pageNumbers(page, pageCount).map((value, index) =>
                    value === null ? (
                      <span key={`gap-${index}`} className="px-1">…</span>
                    ) : (
                      <PageButton key={value} active={value === page} onClick={() => updateParams({ page: value === 1 ? null : value }, false)}>
                        {value}
                      </PageButton>
                    ),
                  )}
                  <PageButton disabled={page >= pageCount} onClick={() => updateParams({ page: page + 1 }, false)}>
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

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded border border-border-strong bg-white px-2.5 text-xs focus:ring-2 focus:ring-focus-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MobileField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-secondary">{label}</dt>
      <dd className={`truncate font-medium text-text-primary ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 min-w-8 items-center justify-center gap-0.5 rounded border px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-primary bg-primary text-white" : "border-border bg-surface text-text-primary hover:bg-surface-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** 1 … 4 5 6 … 12 */
function pageNumbers(current: number, count: number): (number | null)[] {
  const pages = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1] > 1 ? [null, value] : [value]));
}
