/** Voucher types (UC-2), mirroring backend/schemas/voucher.py. */

import type { ClientRef, DecimalString, InvoiceLineItem, InvoiceStatus, UserRef } from "../invoices/types";

export type VoucherStatus = "CREATED" | "SENT_TO_CLIENT";

/** Vendor option for the Buat Voucher form, grouped by normalized name (VCH-01). */
export interface VoucherVendor {
  key: string;
  name: string;
  invoice_count: number;
}

/** AMIGA_REVIEWED invoice without a voucher (VCH-02). */
export interface EligibleInvoice {
  id: string;
  request_id: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  bank_account: string | null;
  /** Digits-only bank account; rows with a different key cannot be combined (VCH-03). */
  bank_key: string;
  tax_amount: DecimalString | null;
  discount_amount: DecimalString;
  total_amount: DecimalString | null;
  item_count: number;
  original_filename: string;
  mime_type: string;
}

/** A signer on the voucher PDF ("Diajukan oleh" / "Disetujui oleh"). */
export interface VoucherSigner {
  name: string;
  role: string;
}

export interface VoucherCreatePayload {
  client_id: string;
  invoice_ids: string[];
  purpose: string;
  /** Role printed under the creator's name in "Diajukan oleh". */
  submitter_role: string;
  /** "Disetujui oleh", at least one; typed in by hand because approvers can be outside AMIGA. */
  approvers: VoucherSigner[];
}

/** Invoice inside a voucher, with its line items (UC-10 step 3). */
export interface VoucherInvoiceRef {
  id: string;
  request_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  status: InvoiceStatus;
  tax_amount: DecimalString | null;
  discount_amount: DecimalString;
  total_amount: DecimalString | null;
  items: InvoiceLineItem[];
}

export interface VoucherDetail {
  id: string;
  voucher_number: string;
  client: ClientRef;
  vendor_name: string;
  bank_account: string;
  purpose: string;
  total_amount: DecimalString;
  status: VoucherStatus;
  created_by: UserRef;
  created_at: string;
  sent_at: string | null;
  invoices: VoucherInvoiceRef[];
  /** Null/empty on vouchers created before the signature section existed. */
  submitter: VoucherSigner | null;
  approvers: VoucherSigner[];
}

/** Row of the voucher list (UC-10). */
export interface VoucherSummary {
  id: string;
  voucher_number: string;
  client: ClientRef;
  vendor_name: string;
  purpose: string;
  total_amount: DecimalString;
  status: VoucherStatus;
  created_at: string;
  invoice_count: number;
}

export interface VoucherPage {
  items: VoucherSummary[];
  total: number;
  skip: number;
  limit: number;
}

export interface VoucherListQuery {
  client_id?: string;
  skip?: number;
  limit?: number;
}

/** Short-lived PDF link (VCH-11); `voucher` reflects the first-download status change (VCH-12). */
export interface VoucherDownload {
  url: string;
  expires_in: number;
  filename: string;
  first_download: boolean;
  voucher: VoucherDetail;
}
