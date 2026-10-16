/** Invoice endpoints: queue, detail, correction, decision, history, file URL, upload. */

import { apiFetch, refreshAccessToken, withQuery } from "../client";
import { API_BASE_URL } from "../config";
import { apiError, detailMessage } from "../errors";
import { getStoredTokens } from "../storage";
import type {
  AssignedClient,
  AuditEntry,
  ExtractionStatus,
  InvoiceApprovalPayload,
  InvoiceCorrectionPayload,
  InvoiceDetail,
  InvoiceFileUrl,
  InvoiceListQuery,
  InvoicePage,
  InvoiceRejectionPayload,
  InvoiceUploadResult,
} from "./types";

export const invoiceService = {
  assignedClients(): Promise<AssignedClient[]> {
    return apiFetch<AssignedClient[]>("/api/v1/me/clients");
  },

  list(query: InvoiceListQuery = {}): Promise<InvoicePage> {
    return apiFetch<InvoicePage>(withQuery("/api/v1/invoices", query));
  },

  get(invoiceId: string): Promise<InvoiceDetail> {
    return apiFetch<InvoiceDetail>(`/api/v1/invoices/${invoiceId}`);
  },

  extraction(invoiceId: string): Promise<ExtractionStatus> {
    return apiFetch<ExtractionStatus>(`/api/v1/invoices/${invoiceId}/extraction`);
  },

  reextract(invoiceId: string): Promise<ExtractionStatus> {
    return apiFetch<ExtractionStatus>(`/api/v1/invoices/${invoiceId}/extraction`, { method: "POST" });
  },

  fileUrl(invoiceId: string): Promise<InvoiceFileUrl> {
    return apiFetch<InvoiceFileUrl>(`/api/v1/invoices/${invoiceId}/file-url`);
  },

  /** Intake or Finance Reviewer correction; throws ApiError with status 409 (conflict) or 422 (detail per field). */
  correct(invoiceId: string, payload: InvoiceCorrectionPayload): Promise<InvoiceDetail> {
    return apiFetch<InvoiceDetail>(`/api/v1/invoices/${invoiceId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  /** Finance Reviewer approval; throws ApiError 403 (SoD/assignment), 409 (conflict/not ready), or 422 (note). */
  approve(invoiceId: string, payload: InvoiceApprovalPayload): Promise<InvoiceDetail> {
    return apiFetch<InvoiceDetail>(`/api/v1/invoices/${invoiceId}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  /** Finance Reviewer rejection (final); throws ApiError 403, 409, or 422 like approve. */
  reject(invoiceId: string, payload: InvoiceRejectionPayload): Promise<InvoiceDetail> {
    return apiFetch<InvoiceDetail>(`/api/v1/invoices/${invoiceId}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  history(invoiceId: string): Promise<AuditEntry[]> {
    return apiFetch<AuditEntry[]>(`/api/v1/invoices/${invoiceId}/history`);
  },

  /**
   * Multipart upload with progress. fetch has no upload progress, so this uses
   * XMLHttpRequest; a 401 triggers one token refresh and a retry.
   */
  async upload(form: FormData, onProgress?: (percent: number) => void): Promise<InvoiceUploadResult> {
    const send = (token: string | undefined) =>
      new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}/api/v1/invoices`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
          let body: unknown = null;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            body = xhr.responseText;
          }
          resolve({ status: xhr.status, body });
        };
        xhr.onerror = () => reject(new Error("Koneksi ke server terputus. Periksa jaringan lalu coba lagi."));
        xhr.send(form);
      });

    let response = await send(getStoredTokens()?.accessToken);
    if (response.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) throw Object.assign(new Error("Sesi login Anda telah berakhir. Silakan masuk kembali."), { status: 401 });
      response = await send(refreshed.access_token);
    }
    if (response.status < 200 || response.status >= 300) {
      const detail = (response.body as { detail?: unknown } | null)?.detail;
      throw apiError(detailMessage(detail, `Upload gagal (${response.status}).`), response.status, detail);
    }
    return response.body as InvoiceUploadResult;
  },
};
