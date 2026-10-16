/** Voucher endpoints: list (UC-10), form options, eligible invoices, create (UC-2), download (UC-9). */

import { apiFetch, withQuery } from "../client";
import type {
  EligibleInvoice,
  VoucherCreatePayload,
  VoucherDetail,
  VoucherDownload,
  VoucherListQuery,
  VoucherPage,
  VoucherVendor,
} from "./types";

export const voucherService = {
  list(query: VoucherListQuery = {}): Promise<VoucherPage> {
    return apiFetch<VoucherPage>(withQuery("/api/v1/vouchers", query));
  },

  vendors(clientId: string): Promise<VoucherVendor[]> {
    return apiFetch<VoucherVendor[]>(withQuery("/api/v1/vouchers/vendors", { client_id: clientId }));
  },

  eligibleInvoices(clientId: string, vendorKey: string): Promise<EligibleInvoice[]> {
    return apiFetch<EligibleInvoice[]>(
      withQuery("/api/v1/vouchers/eligible-invoices", { client_id: clientId, vendor_key: vendorKey }),
    );
  },

  create(payload: VoucherCreatePayload): Promise<VoucherDetail> {
    return apiFetch<VoucherDetail>("/api/v1/vouchers", { method: "POST", body: JSON.stringify(payload) });
  },

  get(voucherId: string): Promise<VoucherDetail> {
    return apiFetch<VoucherDetail>(`/api/v1/vouchers/${voucherId}`);
  },

  /** The first download moves the voucher and its invoices to SENT_TO_CLIENT. */
  download(voucherId: string): Promise<VoucherDownload> {
    return apiFetch<VoucherDownload>(`/api/v1/vouchers/${voucherId}/download`, { method: "POST" });
  },
};

/**
 * Start the browser download from a presigned URL. The response is served as an attachment, so the
 * page stays put; window.open after an await would be blocked as a popup.
 */
export function startDownload(url: string): void {
  window.location.href = url;
}
