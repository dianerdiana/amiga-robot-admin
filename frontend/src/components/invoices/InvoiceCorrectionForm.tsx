"use client";

import { Fragment, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  InvoiceCorrectionPayload,
  InvoiceDetail,
  ValidationIssue,
  errorStatus,
  invoiceService,
} from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import { CORRECTION_REASON_PRESETS } from "./meta";

const REASON_MIN = 10;
const REASON_MAX = 500;

type HeaderField =
  | "vendor_name"
  | "invoice_number"
  | "invoice_date"
  | "bank_account"
  | "tax_amount"
  | "discount_amount"
  | "total_amount";

type Row = { key: number; description: string; quantity: string; unit_price: string; amount: string };
type FormState = Record<HeaderField, string> & { items: Row[] };

const HEADER_FIELDS: { field: HeaderField; label: string; type: "text" | "date" | "number"; mono?: boolean }[] = [
  { field: "vendor_name", label: "Vendor", type: "text" },
  { field: "invoice_number", label: "Nomor Invoice", type: "text", mono: true },
  { field: "invoice_date", label: "Tanggal Invoice", type: "date" },
  { field: "bank_account", label: "Rekening Tujuan (Bank & No. Rek)", type: "text", mono: true },
  { field: "discount_amount", label: "Diskon", type: "number", mono: true },
  { field: "tax_amount", label: "Pajak (PPN)", type: "number", mono: true },
  { field: "total_amount", label: "Total Invoice Final", type: "number", mono: true },
];

let rowKey = 0;
const toText = (value: string | null | undefined) => value ?? "";

/** Remove insignificant trailing zeroes without converting through a JS number. */
const normalizeDecimalText = (value: string | null | undefined) => {
  const text = toText(value);
  const match = /^(\d+)\.(\d+)$/.exec(text);
  if (!match) return text;

  const fraction = match[2].replace(/0+$/, "");
  return fraction ? `${match[1]}.${fraction}` : match[1];
};

/** Format the canonical API decimal for editing with Indonesian separators, without an Rp prefix. */
const formatDecimalInput = (value: string) => {
  if (!value) return "";
  const [integer, fraction] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
};

/** Convert an Indonesian-formatted edit value back to the canonical decimal used by the API. */
const parseDecimalInput = (value: string, decimalPlaces: number) => {
  const filtered = value.replace(/[^0-9.,]/g, "");
  if (!filtered) return "";

  const commaIndex = filtered.indexOf(",");
  const integerSource = commaIndex >= 0 ? filtered.slice(0, commaIndex) : filtered;
  const integer = integerSource.replace(/\D/g, "") || "0";
  if (commaIndex < 0) return integer;

  const fraction = filtered.slice(commaIndex + 1).replace(/\D/g, "").slice(0, decimalPlaces);
  return `${integer}.${fraction}`;
};

function initialState(invoice: InvoiceDetail): FormState {
  return {
    vendor_name: toText(invoice.vendor_name),
    invoice_number: toText(invoice.invoice_number),
    invoice_date: toText(invoice.invoice_date),
    bank_account: toText(invoice.bank_account),
    tax_amount: normalizeDecimalText(invoice.tax_amount),
    discount_amount: normalizeDecimalText(invoice.discount_amount),
    total_amount: normalizeDecimalText(invoice.total_amount),
    items: invoice.items.map((item) => ({
      key: ++rowKey,
      description: toText(item.description),
      quantity: normalizeDecimalText(item.quantity),
      unit_price: normalizeDecimalText(item.unit_price),
      amount: normalizeDecimalText(item.amount),
    })),
  };
}

const nullable = (value: string) => (value.trim() === "" ? null : value.trim());
const toNumber = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? 0 : Number(value));

/** Comparable snapshot used to detect unsaved changes (numbers compared by value). */
function snapshot(state: FormState): string {
  const num = (v: string) => (v.trim() === "" ? null : Number.isNaN(Number(v)) ? v.trim() : Number(v));
  return JSON.stringify({
    vendor_name: nullable(state.vendor_name),
    invoice_number: nullable(state.invoice_number),
    invoice_date: nullable(state.invoice_date),
    bank_account: nullable(state.bank_account),
    tax_amount: num(state.tax_amount),
    discount_amount: num(state.discount_amount) ?? 0,
    total_amount: num(state.total_amount),
    items: state.items.map((r) => [nullable(r.description), num(r.quantity), num(r.unit_price), num(r.amount)]),
  });
}

const withoutKeys = (errors: Record<string, string>, drop: (key: string) => boolean) =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => !drop(key)));

/** Map FastAPI `loc` (["body", "items", 2, "amount"]) to a form key ("items.2.amount"). */
const issueKey = (issue: ValidationIssue) => issue.loc.filter((part) => part !== "body").join(".");

/**
 * Editable form for correcting extracted invoice data, styled after templates/invoice-review.html.
 * The backend is the source of truth for validation; this form only shows its verdict per field.
 *
 * - `variant="page"` (Intake detail): opened by "Koreksi Data"; Batal leaves edit mode via `onCancel`.
 * - `variant="pane"` (reviewer split-screen): always editable; Batal only discards local changes, and
 *   `renderActions` adds the decision buttons to the same sticky bar. Remount with `key={invoice.version}`
 *   after a save so the form starts from the saved data.
 */
export default function InvoiceCorrectionForm({
  invoice,
  onSaved,
  onCancel,
  onConflict,
  variant = "page",
  onDirtyChange,
  renderActions,
}: {
  invoice: InvoiceDetail;
  onSaved: (detail: InvoiceDetail) => void;
  onCancel?: () => void;
  onConflict: (message: string) => void;
  variant?: "page" | "pane";
  onDirtyChange?: (dirty: boolean) => void;
  renderActions?: (state: { dirty: boolean; saving: boolean }) => ReactNode;
}) {
  const pane = variant === "pane";
  const initial = useMemo(() => initialState(invoice), [invoice]);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bannerErrors, setBannerErrors] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = snapshot(form) !== snapshot(initial);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const changedFields = useMemo(() => {
    const now = JSON.parse(snapshot(form));
    const before = JSON.parse(snapshot(initial));
    const differs = (key: string) => JSON.stringify(now[key]) !== JSON.stringify(before[key]);
    const labels = HEADER_FIELDS.filter(({ field }) => differs(field)).map(({ label }) => label);
    return differs("items") ? [...labels, "Baris barang"] : labels;
  }, [form, initial]);

  const subtotal = form.items.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const expected = subtotal - toNumber(form.discount_amount) + toNumber(form.tax_amount);
  const difference = form.total_amount.trim() === "" ? null : expected - toNumber(form.total_amount);

  const setField = (field: HeaderField, value: string, type: string) => {
    setForm((current) => ({ ...current, [field]: type === "number" ? parseDecimalInput(value, 2) : value }));
    setErrors((current) => withoutKeys(current, (key) => key === field));
  };
  const setRow = (index: number, field: keyof Omit<Row, "key">, value: string) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((row, i) =>
        i === index
          ? { ...row, [field]: field === "description" ? value : parseDecimalInput(value, field === "quantity" ? 4 : 2) }
          : row,
      ),
    }));
    setErrors((current) => withoutKeys(current, (key) => key === `items.${index}.${field}` || key === `items.${index}`));
  };
  const addRow = () =>
    setForm((current) => ({
      ...current,
      items: [...current.items, { key: ++rowKey, description: "", quantity: "", unit_price: "", amount: "" }],
    }));
  // Row indexes shift after a removal, so stale per-row backend errors are cleared.
  const removeRow = (index: number) => {
    setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }));
    setErrors((current) => withoutKeys(current, (key) => key.startsWith("items.")));
  };

  const cancel = () => {
    if (dirty && !window.confirm("Batalkan koreksi? Perubahan yang belum disimpan akan hilang.")) return;
    if (pane) {
      setForm(initial);
      setErrors({});
      setBannerErrors([]);
    } else {
      onCancel?.();
    }
  };

  const submit = async () => {
    setSaving(true);
    setReasonError(null);
    const payload: InvoiceCorrectionPayload = {
      version: invoice.version,
      reason,
      vendor_name: nullable(form.vendor_name),
      invoice_number: nullable(form.invoice_number),
      invoice_date: nullable(form.invoice_date),
      bank_account: nullable(form.bank_account),
      tax_amount: nullable(form.tax_amount),
      discount_amount: nullable(form.discount_amount),
      total_amount: nullable(form.total_amount),
      items: form.items.map((row) => ({
        description: nullable(row.description),
        quantity: nullable(row.quantity),
        unit_price: nullable(row.unit_price),
        amount: nullable(row.amount),
      })),
    };
    try {
      const saved = await invoiceService.correct(invoice.id, payload);
      setDialogOpen(false);
      onSaved(saved);
    } catch (err) {
      const status = errorStatus(err);
      const issues = (err as ApiError).detail ?? [];
      if (status === 409) {
        setDialogOpen(false);
        onConflict(err instanceof Error ? err.message : "Data sudah diubah user lain, muat ulang.");
      } else if (status === 422 && issues.length) {
        const fieldErrors: Record<string, string> = {};
        const unplaced: string[] = [];
        issues.forEach((issue) => {
          const key = issueKey(issue);
          if (key === "reason") setReasonError(issue.msg);
          else if (key in form || key.startsWith("items.")) fieldErrors[key] = issue.msg;
          else unplaced.push(issue.msg);
        });
        setErrors(fieldErrors);
        setBannerErrors(unplaced);
        if (Object.keys(fieldErrors).length || unplaced.length) setDialogOpen(false);
      } else {
        setDialogOpen(false);
        setBannerErrors([err instanceof Error ? err.message : "Koreksi gagal disimpan."]);
      }
    } finally {
      setSaving(false);
    }
  };

  const errorCount = Object.keys(errors).length + bannerErrors.length;
  const inputClass = (key: string, mono = false) =>
    `h-9 w-full rounded border bg-white px-2.5 text-sm focus:ring-2 focus:ring-focus-ring ${mono ? "font-mono" : ""} ${
      errors[key] ? "border-danger bg-danger-subtle/30" : "border-border-strong"
    }`;

  return (
    <div className="flex flex-col gap-5">
      {errorCount > 0 && (
        <div role="alert" className="rounded-lg border-l-4 border-danger bg-danger-subtle p-4 text-xs text-status-rejected-fg">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">error</span>
            Koreksi belum dapat disimpan
          </p>
          <p>Periksa {Object.keys(errors).length || ""} isian yang ditandai merah.</p>
          {bannerErrors.map((message) => (
            <p key={message}>• {message}</p>
          ))}
        </div>
      )}

      {/* Header data form */}
      <section aria-label="Verifikasi Data Form" className="rounded-lg border border-primary bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
            Koreksi Data Invoice
          </h3>
          <span className="text-[11px] text-text-secondary">Hasil AI asli tetap tersimpan di riwayat ekstraksi</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {HEADER_FIELDS.map(({ field, label, type, mono }) => (
            <label key={field} className="block min-w-0">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
              <input
                type={type === "date" ? "date" : "text"}
                inputMode={type === "number" ? "decimal" : undefined}
                value={type === "number" ? formatDecimalInput(form[field]) : form[field]}
                placeholder={type === "number" ? "0,00" : "Tidak ditemukan"}
                onChange={(event) => setField(field, event.target.value, type)}
                aria-invalid={Boolean(errors[field])}
                className={inputClass(field, mono)}
              />
              {errors[field] && <span className="mt-1 block text-xs font-medium text-danger">{errors[field]}</span>}
            </label>
          ))}
        </div>
      </section>

      {/* Line items editor */}
      <section className="rounded-lg border border-primary bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-primary">format_list_numbered</span>
              Baris Rincian Barang / Jasa
            </h3>
            <p className="text-[11px] text-text-secondary">Penyesuaian baris akan memicu rekalkulasi otomatis.</p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="flex h-8 items-center gap-1 rounded border border-border bg-surface-muted px-2.5 text-xs font-semibold hover:bg-surface-sunken"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
            Tambah Baris
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="h-10 border-b border-border bg-surface-muted text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                <th className="w-12 px-4">No</th>
                <th className="px-2">Deskripsi</th>
                <th className="w-24 px-2 text-right">Qty</th>
                <th className="w-36 px-2 text-right">Harga Satuan</th>
                <th className="w-40 px-2 text-right">Jumlah (Rp)</th>
                <th className="w-14 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-muted">
              {form.items.map((row, index) => (
                <Fragment key={row.key}>
                <tr className={errors[`items.${index}`] ? "bg-danger-subtle/40" : ""}>
                  <td className="px-4 py-2 align-top font-mono text-text-secondary">{index + 1}</td>
                  {(["description", "quantity", "unit_price", "amount"] as const).map((field) => {
                    const key = `items.${index}.${field}`;
                    return (
                      <td key={field} className="px-2 py-2 align-top">
                        <input
                          aria-label={`Baris ${index + 1} ${field}`}
                          inputMode={field === "description" ? undefined : "decimal"}
                          value={field === "description" ? row[field] : formatDecimalInput(row[field])}
                          onChange={(event) => setRow(index, field, event.target.value)}
                          aria-invalid={Boolean(errors[key])}
                          className={`${inputClass(key, field !== "description")} ${field === "description" ? "" : "text-right"}`}
                        />
                        {errors[key] && <span className="mt-1 block text-[11px] font-medium text-danger">{errors[key]}</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-center align-top">
                    <button
                      type="button"
                      title="Hapus Baris"
                      onClick={() => removeRow(index)}
                      className="rounded p-1.5 text-text-secondary hover:bg-danger-subtle hover:text-danger"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </td>
                </tr>
                {errors[`items.${index}`] && (
                  <tr className="bg-danger-subtle/40">
                    <td colSpan={6} className="px-4 pb-2 text-[11px] font-medium text-danger">
                      Baris {index + 1}: {errors[`items.${index}`]}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {form.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center italic text-text-disabled">
                    Belum ada baris barang. Klik &quot;Tambah Baris&quot; untuk menambahkan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Computation footer: preview of the backend's VAL-03 total check */}
        <div className="flex flex-col gap-2 border-t border-border bg-surface-muted/60 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono tabular-nums">
            <span>Subtotal: <strong>{formatRupiah(subtotal)}</strong></span>
            <span>Perkiraan total: <strong>{formatRupiah(expected)}</strong></span>
          </div>
          {difference !== null && Math.abs(difference) > 0.004 ? (
            <span className="inline-flex items-center gap-1 rounded border border-status-exception-border bg-chip-total-mismatch-bg px-2 py-0.5 font-semibold text-chip-total-mismatch-fg">
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">calculate</span>
              Total Mismatch (selisih {formatRupiah(Math.abs(difference))})
            </span>
          ) : difference !== null ? (
            <span className="inline-flex items-center gap-1 font-semibold text-success">
              <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
              Total sesuai
            </span>
          ) : null}
        </div>
      </section>

      {/* Sticky action bar */}
      <div
        className={`sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg ${
          pane ? "-mx-4 sm:-mx-6 sm:px-6" : "-mx-4 sm:-mx-8 sm:px-8"
        }`}
      >
        <span className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${dirty ? "bg-warning" : "bg-border-strong"}`} />
          <span className="font-medium text-text-secondary">{dirty ? "Ada perubahan belum disimpan" : "Tidak ada perubahan"}</span>
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          {(!pane || dirty) && (
            <button type="button" onClick={cancel} className="h-9 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted">
              Batal
            </button>
          )}
          <button
            type="button"
            disabled={!dirty}
            title={dirty ? undefined : "Tidak ada perubahan"}
            onClick={() => {
              setReasonError(null);
              setDialogOpen(true);
            }}
            className="flex h-9 items-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-text-disabled"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">save</span>
            Simpan
          </button>
          {renderActions?.({ dirty, saving })}
        </div>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4" onClick={() => !saving && setDialogOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reason-dialog-title"
            className="w-full max-w-modal-md rounded-lg bg-surface p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="reason-dialog-title" className="text-base font-bold">Alasan Koreksi</h4>
            <p className="mt-1 text-xs text-text-secondary">
              {pane
                ? "Jelaskan alasan perubahan. Alasan dicatat di riwayat dan terlihat oleh Intake."
                : "Jelaskan alasan perubahan. Alasan dicatat di riwayat dan terlihat oleh Finance Reviewer."}
            </p>
            <div className="mt-3 rounded border border-border bg-surface-muted px-3 py-2 text-xs">
              <span className="font-semibold">Isian yang diubah: </span>
              {changedFields.join(", ") || "-"}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CORRECTION_REASON_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason((current) => (current.trim() ? `${current.trim()}; ${preset}` : preset))}
                  className="rounded-full border border-status-vouchered-border bg-primary-subtle px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-white"
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(null);
              }}
              maxLength={REASON_MAX}
              rows={4}
              placeholder="Contoh: Nomor rekening diambil dari surat konfirmasi vendor."
              aria-invalid={Boolean(reasonError)}
              className={`mt-3 w-full rounded border bg-white p-2.5 text-sm focus:ring-2 focus:ring-focus-ring ${reasonError ? "border-danger" : "border-border-strong"}`}
            />
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="font-medium text-danger">{reasonError}</span>
              <span className={reason.trim().length < REASON_MIN ? "text-text-disabled" : "text-text-secondary"}>
                {reason.trim().length}/{REASON_MAX} (min. {REASON_MIN})
              </span>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setDialogOpen(false)} className="h-9 rounded border border-border px-4 text-xs font-semibold hover:bg-surface-muted">
                Kembali
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submit()}
                className="flex h-9 items-center gap-1.5 rounded bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Simpan Koreksi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
