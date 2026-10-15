import { apiFetch, API_BASE_URL } from "@/lib/api";

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

export async function getReviewQueue(options: {
  statuses?: string[];
  limit?: number;
  offset?: number;
} = {}): Promise<ReviewQueueResult> {
  const {
    statuses = ["READY_FOR_REVIEW", "EXCEPTION"],
    limit = 10,
    offset = 0,
  } = options;

  const params = new URLSearchParams();
  statuses.forEach((status) => params.append("status", status));
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  const result = (await apiFetch<ReviewInvoice[]>(
    `/invoices?${params.toString()}`,
    {
      method: "GET",
      _includeHeaders: true,
    }
  )) as unknown as { data: ReviewInvoice[]; headers: Headers };

  const total = Number(result.headers.get("X-Total-Count") ?? result.data.length);

  return {
    items: result.data,
    total,
  };
}

export async function getReviewInvoice(id: string): Promise<ReviewInvoice> {
  return apiFetch<ReviewInvoice>(`/invoices/${id}`, {
    method: "GET",
  });
}

export async function correctReviewInvoice(id: string, payload: CorrectInvoicePayload): Promise<ReviewInvoice> {
  return apiFetch<ReviewInvoice>(`/invoices/${id}/correct`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveReviewInvoice(id: string, note?: string, expectedVersion?: number): Promise<ReviewInvoice> {
  return apiFetch<ReviewInvoice>(`/invoices/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null, expected_version: expectedVersion ?? null }),
  });
}

export async function rejectReviewInvoice(id: string, rejectNote: string, expectedVersion?: number): Promise<ReviewInvoice> {
  return apiFetch<ReviewInvoice>(`/invoices/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reject_note: rejectNote, expected_version: expectedVersion ?? null }),
  });
}

export async function getReviewAudit(id: string): Promise<ReviewAuditLog[]> {
  return apiFetch<ReviewAuditLog[]>(`/invoices/${id}/audit`, {
    method: "GET",
  });
}