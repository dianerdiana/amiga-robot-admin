import Link from "next/link";
import { InvoiceDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** Reviewer decision for UC-6; `showReupload` adds Intake's "Unggah ulang" action on REJECTED. */
export default function DecisionBlock({ invoice, showReupload = true }: { invoice: InvoiceDetail; showReupload?: boolean }) {
  const decision = invoice.decision;
  if (invoice.status === "REJECTED" && decision) {
    return (
      <section className="rounded-lg border border-status-rejected-border bg-danger-subtle p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 text-xs">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex items-center gap-1 font-bold text-status-rejected-fg">
                <span aria-hidden="true" className="material-symbols-outlined text-[20px]">cancel</span>
                Ditolak
              </span>
              <span className="font-semibold">{decision.reviewer?.name ?? "Finance Reviewer"}</span>
              <span className="text-text-secondary">(Finance Reviewer)</span>
              {decision.decided_at && <span className="text-text-secondary">• {formatDateTime(decision.decided_at)}</span>}
            </p>
            {decision.reject_note && (
              <div>
                <p className="font-semibold text-text-secondary">Alasan Penolakan:</p>
                <p className="italic text-text-primary">“{decision.reject_note}”</p>
              </div>
            )}
            <p className="text-text-secondary">
              Request lama berstatus final. Perbaikan diunggah sebagai request baru dengan referensi request ini.
            </p>
          </div>
          {showReupload && (
            <Link
              href={`/invoices/upload?previous=${invoice.id}`}
              className="flex shrink-0 flex-col items-center justify-center rounded bg-primary px-5 py-2 text-white no-underline hover:bg-primary-hover"
            >
              <span className="text-sm font-semibold">Unggah ulang</span>
              <span className="text-[11px] opacity-80">Buat Request Pengganti</span>
            </Link>
          )}
        </div>
      </section>
    );
  }
  if (decision?.reviewer && invoice.status !== "REJECTED") {
    return (
      <section className="rounded-lg border border-status-reviewed-border bg-success-subtle p-4 text-xs sm:p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1 font-bold text-success">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">verified</span>
            Disetujui
          </span>
          <span className="font-semibold">{decision.reviewer.name}</span>
          <span className="text-text-secondary">(Finance Reviewer)</span>
          {decision.decided_at && <span className="text-text-secondary">• {formatDateTime(decision.decided_at)}</span>}
        </p>
      </section>
    );
  }
  return (
    <section className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted px-4 py-3 text-xs text-text-secondary sm:px-5">
      <span aria-hidden="true" className="material-symbols-outlined text-[20px]">hourglass_top</span>
      <span>
        Menunggu pemeriksaan oleh Finance Reviewer.
        {!invoice.has_reviewer && <strong className="ml-1 text-text-primary">Klien ini belum memiliki reviewer aktif.</strong>}
      </span>
    </section>
  );
}
