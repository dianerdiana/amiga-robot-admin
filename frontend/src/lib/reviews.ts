import { apiFetch } from "@/lib/api";

export interface ReviewInvoiceItem {
  id: string;
  invoice_id: string;
  line_no: number;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface ReviewInvoice {
  id: string;
  request_id: string;
  client_id: string;
  client_name: string | null;
  uploaded_by: string;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  voucher_id: string | null;
  previous_request_id: string | null;
  request_type: string;
  channel: string;
  request_date: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  bank_account: string | null;
  tax_amount: number | null;
  discount_amount: number;
  total_amount: number | null;
  file_key: string;
  original_filename: string;
  mime_type: string;
  status: string;
  exception_codes: string[];
  reject_note: string | null;
  version: number;
  created_at: string;
  updated_at: string | null;
  items: ReviewInvoiceItem[];
}

export interface ReviewAuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  user_id: string;
  user_name: string | null;
  created_at: string;
}

export interface CorrectInvoicePayload {
  vendor_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  bank_account?: string;
  tax_amount?: number;
  discount_amount?: number;
  total_amount?: number;
  expected_version?: number;
}

export interface ReviewQueueResult {
  items: ReviewInvoice[];
  total: number;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function mapItem(raw: any, index: number, invoiceId: string): ReviewInvoiceItem {
  return {
    id: raw?.id != null ? String(raw.id) : `${invoiceId}-item-${raw?.line_no ?? index + 1}`,
    invoice_id: invoiceId,
    line_no: Number(raw?.line_no ?? index + 1),
    description: raw?.description ?? null,
    quantity: toNumber(raw?.quantity),
    unit_price: toNumber(raw?.unit_price),
    amount: toNumber(raw?.amount),
  };
}

function mapInvoice(raw: any): ReviewInvoice {
  const client = raw?.client ?? {};
  const decisionReviewer = raw?.decision?.reviewer;
  const uploaded = raw?.uploaded_by;
  const invoiceId = String(raw?.id ?? "");

  return {
    id: invoiceId,
    request_id: raw?.request_id ?? "",
    client_id: String(raw?.client_id ?? client.id ?? ""),
    client_name: raw?.client_name ?? client.name ?? null,
    uploaded_by:
      typeof uploaded === "string"
        ? uploaded
        : uploaded?.id != null
          ? String(uploaded.id)
          : typeof raw?.uploaded_by_name === "string"
            ? raw.uploaded_by_name
            : "",
    reviewed_by: raw?.reviewed_by != null ? String(raw.reviewed_by) : decisionReviewer?.id != null ? String(decisionReviewer.id) : null,
    reviewed_by_name:
      raw?.reviewed_by_name ??
      decisionReviewer?.name ??
      raw?.decision?.reviewer?.name ??
      null,
    voucher_id: raw?.voucher_id != null ? String(raw.voucher_id) : null,
    previous_request_id:
      raw?.previous_request_id != null ? String(raw.previous_request_id) : raw?.previous_request?.id != null ? String(raw.previous_request.id) : null,
    request_type: raw?.request_type ?? raw?.previous_request?.request_type ?? "Pembayaran Vendor",
    channel: raw?.channel ?? "",
    request_date: raw?.request_date ? String(raw.request_date) : "",
    vendor_name: raw?.vendor_name ?? null,
    invoice_number: raw?.invoice_number ?? null,
    invoice_date: raw?.invoice_date ? String(raw.invoice_date) : null,
    bank_account: raw?.bank_account ?? null,
    tax_amount: toNumber(raw?.tax_amount),
    discount_amount: toNumber(raw?.discount_amount) ?? 0,
    total_amount: toNumber(raw?.total_amount),
    file_key: raw?.file_key ?? "",
    original_filename: raw?.original_filename ?? "",
    mime_type: raw?.mime_type ?? "",
    status: String(raw?.status ?? ""),
    exception_codes: Array.isArray(raw?.exception_codes) ? raw.exception_codes : [],
    reject_note: raw?.reject_note ?? raw?.decision?.reject_note ?? null,
    version: Number(raw?.version ?? 1),
    created_at: raw?.created_at ? String(raw.created_at) : new Date().toISOString(),
    updated_at: raw?.updated_at ? String(raw.updated_at) : null,
    items: Array.isArray(raw?.items) ? raw.items.map((item: any, index: number) => mapItem(item, index, invoiceId)) : [],
  };
}

function mapAudit(raw: any): ReviewAuditLog {
  return {
    id: String(raw?.id ?? ""),
    entity_type: raw?.entity_type ?? "invoice",
    entity_id: String(raw?.entity_id ?? ""),
    action: String(raw?.action ?? ""),
    field_name: raw?.field_name ?? null,
    old_value: raw?.old_value ?? null,
    new_value: raw?.new_value ?? null,
    user_id: raw?.user?.id != null ? String(raw.user.id) : raw?.user_id != null ? String(raw.user_id) : "",
    user_name: raw?.user?.name ?? raw?.user_name ?? null,
    created_at: String(raw?.created_at ?? ""),
  };
}

export async function getReviewQueue(options: {
  statuses?: string[];
  limit?: number;
  offset?: number;
} = {}): Promise<ReviewQueueResult> {
  const statuses = options.statuses ?? ["READY_FOR_REVIEW", "EXCEPTION"];
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;

  const params = new URLSearchParams();
  statuses.forEach((status) => params.append("status", status));
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const result = await apiFetch<{ items?: any[]; total?: number }>(`/api/v1/invoices/review-queue?${params.toString()}`);
  const items = Array.isArray(result?.items) ? result.items.map(mapInvoice) : [];

  return {
    items,
    total: Number(result?.total ?? items.length),
  };
}

export async function getReviewInvoice(id: string): Promise<ReviewInvoice> {
  const raw = await apiFetch<any>(`/api/v1/invoices/${id}`);
  return mapInvoice(raw);
}

export async function correctReviewInvoice(id: string, payload: CorrectInvoicePayload): Promise<ReviewInvoice> {
  const raw = await apiFetch<any>(`/api/v1/invoices/${id}/correct`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return mapInvoice(raw);
}

export async function approveReviewInvoice(id: string, note?: string, expectedVersion?: number): Promise<ReviewInvoice> {
  const raw = await apiFetch<any>(`/api/v1/invoices/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null, expected_version: expectedVersion ?? null }),
  });
  return mapInvoice(raw);
}

export async function rejectReviewInvoice(id: string, rejectNote: string, expectedVersion?: number): Promise<ReviewInvoice> {
  const raw = await apiFetch<any>(`/api/v1/invoices/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reject_note: rejectNote, expected_version: expectedVersion ?? null }),
  });
  return mapInvoice(raw);
}

export async function getReviewAudit(id: string): Promise<ReviewAuditLog[]> {
  const raw = await apiFetch<any[]>(`/api/v1/invoices/${id}/audit`);
  return Array.isArray(raw) ? raw.map(mapAudit) : [];
}
