/** API error shape and FastAPI error parsing. */

/** One FastAPI validation issue; `loc` points at the field, e.g. ["body", "items", 2, "amount"]. */
export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type?: string;
}

/** API error carrying the HTTP status (e.g. 403, 409) and, for 422, the field-level issues. */
export type ApiError = Error & { status?: number; detail?: ValidationIssue[] };

export function errorStatus(error: unknown): number | undefined {
  return (error as ApiError | null)?.status;
}

/** Turn a FastAPI `detail` (string or list of validation issues) into a user-facing message. */
export function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d.msg || "Input tidak valid").join(", ");
  }
  return fallback;
}

/** Build an ApiError with the status and, for validation errors, the per-field issues. */
export function apiError(message: string, status: number, detail?: unknown): ApiError {
  const err: ApiError = new Error(message);
  err.status = status;
  if (Array.isArray(detail)) err.detail = detail as ValidationIssue[];
  return err;
}

export async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const errorJson = await response.json();
    let message = "Terjadi kesalahan pada server.";
    if (errorJson && typeof errorJson === "object") {
      message = detailMessage(errorJson.detail, errorJson.message || message);
    }
    return apiError(message, response.status, errorJson?.detail);
  } catch {
    const text = await response.text().catch(() => "");
    return apiError(text || `Error ${response.status}: ${response.statusText}`, response.status);
  }
}
