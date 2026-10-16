import { ExceptionFinding } from "@/lib/api";
import { IssueChip } from "./StatusBadge";
import { EXTRACTION_FAILURE_CODES } from "./meta";

/** Validation findings with their VAL-06 messages; renders nothing when there are none. */
export default function FindingsList({
  exceptions,
  requeue,
}: {
  exceptions: ExceptionFinding[];
  /** Re-extraction action shown next to extraction-failure findings (Intake only). */
  requeue?: { busy: boolean; error: string | null; onRequeue: () => void };
}) {
  if (exceptions.length === 0) return null;
  return (
    <section className="rounded-lg border border-status-exception-border bg-surface shadow-sm">
      <div className="border-b border-status-exception-border bg-warning-subtle px-4 py-3 sm:px-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">report</span>
          Daftar Temuan Kendala
        </h3>
        <p className="text-xs text-text-secondary">Robot AMIGA mendeteksi ketidaksesuaian data berikut saat validasi otomatis.</p>
      </div>
      <ul className="divide-y divide-surface-muted">
        {exceptions.map((finding) => (
          <li key={finding.code} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <span className="shrink-0"><IssueChip code={finding.code} /></span>
              <span className="text-xs text-text-primary">{finding.message}</span>
            </div>
            {requeue && EXTRACTION_FAILURE_CODES.includes(finding.code) && (
              <button
                type="button"
                disabled={requeue.busy}
                onClick={requeue.onRequeue}
                className="flex h-8 shrink-0 items-center justify-center gap-1 rounded border border-border bg-surface px-3 text-xs font-semibold text-primary hover:bg-primary-subtle disabled:opacity-50"
              >
                <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${requeue.busy ? "animate-spin" : ""}`}>refresh</span>
                Ekstrak ulang
              </button>
            )}
          </li>
        ))}
      </ul>
      {requeue?.error && <p className="px-5 pb-3 text-xs text-danger">{requeue.error}</p>}
    </section>
  );
}
