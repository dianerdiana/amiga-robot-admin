import type { InvoiceStatus } from "@/lib/api";

/** Invoice status badges, per templates/invoioce-list.html. */
export const STATUS_META: Record<InvoiceStatus, { label: string; filterLabel: string; icon: string; className: string }> = {
  QUEUED: {
    label: "QUEUED",
    filterLabel: "Queued",
    icon: "schedule",
    className: "border-status-queued-border bg-status-queued-bg text-status-queued-fg",
  },
  PROCESSING: {
    label: "PROCESSING",
    filterLabel: "Processing",
    icon: "progress_activity",
    className: "border-status-processing-border bg-status-processing-bg text-status-processing-fg",
  },
  READY_FOR_REVIEW: {
    label: "READY FOR REVIEW",
    filterLabel: "Ready for Review",
    icon: "check_circle",
    className: "border-status-ready-border bg-status-ready-bg text-status-ready-fg",
  },
  EXCEPTION: {
    label: "EXCEPTION",
    filterLabel: "Exception",
    icon: "warning",
    className: "border-status-exception-border bg-status-exception-bg text-status-exception-fg",
  },
  POSSIBLE_DUPLICATE: {
    label: "POSSIBLE DUPLICATE",
    filterLabel: "Possible Duplicate",
    icon: "not_interested",
    className: "border-status-duplicate-border bg-status-duplicate-bg text-status-duplicate-fg",
  },
  AMIGA_REVIEWED: {
    label: "AMIGA REVIEWED",
    filterLabel: "AMIGA Reviewed",
    icon: "verified_user",
    className: "border-status-reviewed-border bg-status-reviewed-bg text-status-reviewed-fg",
  },
  REJECTED: {
    label: "REJECTED",
    filterLabel: "Rejected",
    icon: "cancel",
    className: "border-status-rejected-border bg-status-rejected-bg text-status-rejected-fg",
  },
  VOUCHERED: {
    label: "VOUCHERED",
    filterLabel: "Vouchered",
    icon: "receipt_long",
    className: "border-status-vouchered-border bg-status-vouchered-bg text-status-vouchered-fg",
  },
  SENT_TO_CLIENT: {
    label: "SENT TO CLIENT",
    filterLabel: "Sent to Client",
    icon: "send",
    className: "border-status-sent-border bg-status-sent-bg text-status-sent-fg",
  },
};

export const INVOICE_STATUSES = Object.keys(STATUS_META) as InvoiceStatus[];

export const NO_REVIEWER_ISSUE = "NO_REVIEWER";

/** "Jenis Kendala" (issue type) labels and chip colors per validation code (VAL-06). */
export const ISSUE_META: Record<string, { label: string; icon: string; className: string }> = {
  NO_REVIEWER: {
    label: "Belum ada reviewer",
    icon: "person_off",
    className: "border-chip-no-reviewer-border bg-chip-no-reviewer-bg text-chip-no-reviewer-fg",
  },
  MISSING_EVIDENCE: {
    label: "Missing Evidence",
    icon: "account_balance",
    className: "border-status-exception-border bg-chip-missing-evidence-bg text-chip-missing-evidence-fg",
  },
  TOTAL_MISMATCH: {
    label: "Total Mismatch",
    icon: "calculate",
    className: "border-status-exception-border bg-chip-total-mismatch-bg text-chip-total-mismatch-fg",
  },
  NO_LINE_ITEMS: {
    label: "No Line Items",
    icon: "format_list_bulleted",
    className: "border-status-exception-border bg-chip-no-line-items-bg text-chip-no-line-items-fg",
  },
  EXTRACTION_FAILED: {
    label: "Extraction Failed",
    icon: "error",
    className: "border-danger bg-chip-extraction-failed-bg text-chip-extraction-failed-fg",
  },
  UNREADABLE_DOCUMENT: {
    label: "Unreadable Document",
    icon: "blur_on",
    className: "border-danger bg-chip-unreadable-document-bg text-chip-unreadable-document-fg",
  },
  POSSIBLE_DUPLICATE: {
    label: "Duplikasi Terdeteksi",
    icon: "content_copy",
    className: "border-status-duplicate-border bg-chip-possible-duplicate-bg text-chip-possible-duplicate-fg",
  },
};

export const ISSUE_FILTERS = [
  NO_REVIEWER_ISSUE,
  "MISSING_EVIDENCE",
  "TOTAL_MISMATCH",
  "NO_LINE_ITEMS",
  "EXTRACTION_FAILED",
  "UNREADABLE_DOCUMENT",
  "POSSIBLE_DUPLICATE",
];

export const ISSUE_FILTER_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ISSUE_META).map(([code, meta]) => [code, meta.label])),
  POSSIBLE_DUPLICATE: "Possible Duplicate",
};

export const EXTRACTION_FAILURE_CODES = ["EXTRACTION_FAILED", "UNREADABLE_DOCUMENT"];

/** Audit action labels for the history table (request-detail.html). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  UPLOADED: "Upload Dokumen",
  STATUS_CHANGED: "Ubah Status",
  EXCEPTIONS_DETECTED: "Deteksi Temuan",
  EXTRACTION_REQUEUED: "Ekstraksi Ulang",
  APPROVED: "Setujui Request",
  REJECTED: "Tolak Request",
  FIELD_UPDATED: "Koreksi Data",
};

export const CHANNEL_LABELS: Record<string, string> = {
  WhatsApp: "WhatsApp",
  Email: "Email",
  Lainnya: "Lainnya (Kurir/Fisik/Portal Eksternal)",
};

export const isProcessing = (status: InvoiceStatus) => status === "QUEUED" || status === "PROCESSING";
