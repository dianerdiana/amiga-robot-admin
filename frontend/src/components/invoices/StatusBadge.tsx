import type { InvoiceStatus } from "@/lib/api";
import { ISSUE_META, STATUS_META } from "./meta";

export function StatusBadge({ status, size = "sm" }: { status: InvoiceStatus; size?: "sm" | "md" }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border font-semibold ${meta.className} ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`material-symbols-outlined ${size === "md" ? "text-[16px]" : "text-[14px]"} ${
          status === "PROCESSING" ? "animate-spin" : ""
        }`}
      >
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

export function IssueChip({ code }: { code: string }) {
  const meta = ISSUE_META[code] ?? { label: code, icon: "info", className: "border-border bg-surface-muted text-text-secondary" };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      <span aria-hidden="true" className="material-symbols-outlined text-[13px]">
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

/** "Kendala" (issues) column: the first finding plus "+N" for the rest, or the no-reviewer indicator. */
export function IssueSummary({ codes, hasReviewer }: { codes: string[]; hasReviewer: boolean }) {
  const issues = hasReviewer ? codes : [...codes, "NO_REVIEWER"];
  if (issues.length === 0) return <span className="text-text-disabled">-</span>;
  const rest = issues.length - 1;
  return (
    <span className="inline-flex items-center gap-1" title={issues.map((code) => ISSUE_META[code]?.label ?? code).join(", ")}>
      <IssueChip code={issues[0]} />
      {rest > 0 && <span className="text-[11px] font-semibold text-text-secondary">+{rest}</span>}
    </span>
  );
}
