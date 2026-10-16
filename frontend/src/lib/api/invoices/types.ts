/** Invoice types (UC-1, UC-5 to UC-8), mirroring backend/schemas/invoice.py. */

export type InvoiceStatus =
  | "QUEUED"
  | "PROCESSING"
  | "READY_FOR_REVIEW"
  | "EXCEPTION"
  | "POSSIBLE_DUPLICATE"
  | "AMIGA_REVIEWED"
  | "REJECTED"
  | "VOUCHERED"
  | "SENT_TO_CLIENT";

export type ExceptionCode =
  | "MISSING_EVIDENCE"
  | "TOTAL_MISMATCH"
  | "NO_LINE_ITEMS"
  | "EXTRACTION_FAILED"
  | "UNREADABLE_DOCUMENT"
  | "POSSIBLE_DUPLICATE";

export type InvoiceChannel = "WhatsApp" | "Email" | "Lainnya";

/** Amounts and quantities are sent by the backend as decimal strings. */
export type DecimalString = string;

export interface ClientRef {
  id: string;
  code: string;
  name: string;
}

export interface AssignedClient extends ClientRef {
  has_reviewer: boolean;
}

export interface UserRef {
  id: string;
  name: string;
  is_system: boolean;
}

export interface ExceptionFinding {
  code: ExceptionCode | string;
  message: string;
}

export interface InvoiceSummary {
  id: string;
  request_id: string;
  client: ClientRef;
  vendor_name: string | null;
  invoice_number: string | null;
  total_amount: DecimalString | null;
  status: InvoiceStatus;
  request_date: string;
  created_at: string;
  exception_codes: string[];
  has_reviewer: boolean;
}

export interface InvoicePage {
  items: InvoiceSummary[];
  total: number;
  skip: number;
  limit: number;
}

export interface InvoiceLineItem {
  line_no: number;
  description: string | null;
  quantity: DecimalString | null;
  unit_price: DecimalString | null;
  amount: DecimalString | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  request_type: string;
  channel: InvoiceChannel | string;
  invoice_date: string | null;
  bank_account: string | null;
  tax_amount: DecimalString | null;
  discount_amount: DecimalString;
  subtotal_amount: DecimalString | null;
  items: InvoiceLineItem[];
  exceptions: ExceptionFinding[];
  original_filename: string;
  file_size: number | null;
  mime_type: string;
  uploaded_by: UserRef;
  extracted_at: string | null;
  is_draft: boolean;
  decision: {
    status: InvoiceStatus;
    reviewer: UserRef | null;
    decided_at: string | null;
    reject_note: string | null;
  } | null;
  previous_request: {
    id: string;
    request_id: string;
    status: InvoiceStatus;
    reject_note: string | null;
  } | null;
  version: number;
  can_edit: boolean;
  /** Finance Reviewer decision flags; always false for Intake and for the uploader (SoD). */
  can_approve: boolean;
  can_reject: boolean;
  /** POSSIBLE_DUPLICATE approval needs a justification note. */
  approve_requires_note: boolean;
  last_correction: { by: UserRef; at: string; reason: string } | null;
}

export interface InvoiceItemInput {
  description: string | null;
  quantity: string | null;
  unit_price: string | null;
  amount: string | null;
}

/** Body of POST /api/v1/invoices/{id}/approve; `note` is required for POSSIBLE_DUPLICATE. */
export interface InvoiceApprovalPayload {
  version: number;
  note?: string | null;
}

/** Body of POST /api/v1/invoices/{id}/reject; `note` is required (10-500 characters). */
export interface InvoiceRejectionPayload {
  version: number;
  note: string;
}

/** Body of PUT /api/v1/invoices/{id}; the backend validates every field. */
export interface InvoiceCorrectionPayload {
  version: number;
  reason: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  bank_account: string | null;
  tax_amount: string | null;
  discount_amount: string | null;
  total_amount: string | null;
  items: InvoiceItemInput[];
}

export interface InvoiceUploadResult {
  id: string;
  request_id: string;
  status: InvoiceStatus;
  client: ClientRef;
  has_reviewer: boolean;
  original_filename: string;
  file_size: number;
  mime_type: string;
  channel: string;
  request_type: string;
  request_date: string;
  uploaded_by: UserRef;
  created_at: string;
}

/** Structured Bedrock extraction output (ExtractedInvoice in the backend). */
export interface ExtractedInvoice {
  readable: boolean;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  bank_account: string | null;
  tax_amount: DecimalString | null;
  discount_amount: DecimalString | null;
  total_amount: DecimalString | null;
  items: InvoiceLineItem[];
}

export interface ExtractionStatus {
  invoice_id: string;
  request_id: string;
  status: InvoiceStatus;
  attempts: number;
  started_at: string | null;
  extracted_at: string | null;
  error: string | null;
  exceptions: ExceptionFinding[];
  result: ExtractedInvoice | null;
}

export interface InvoiceFileUrl {
  url: string;
  expires_in: number;
  mime_type: string;
  original_filename: string;
  file_size: number | null;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  user: UserRef;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
}

export interface InvoiceListQuery {
  client_id?: string;
  status?: InvoiceStatus;
  issue?: string;
  date_from?: string;
  date_to?: string;
  skip?: number;
  limit?: number;
}
