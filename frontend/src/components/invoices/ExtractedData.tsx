import { InvoiceDetail } from "@/lib/api";
import { formatDate, formatQuantity, formatRupiah } from "@/lib/format";

/** Read-only extracted invoice fields and line items (UC-5), used when the data cannot be edited. */
export default function ExtractedData({ invoice }: { invoice: InvoiceDetail }) {
  const missingBank = invoice.exception_codes.includes("MISSING_EVIDENCE");
  return (
    <>
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
