/**
 * AMIGA Robot Admin - API Client with Automatic Token Refresh & Retry Interceptor
 * Terhubung ke backend FastAPI (/auth/login, /auth/refresh-token, /auth/me)
 */

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "INTAKE" | "FINANCE_REVIEWER" | "SERVICE_LEAD" | "SYSTEM_ADMIN" | string;
  is_active: boolean;
  created_at: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type ManageableUserRole =
  | "INTAKE"
  | "FINANCE_REVIEWER"
  | "SERVICE_LEAD"
  | "SYSTEM_ADMIN";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: ManageableUserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: ManageableUserRole;
  is_active?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  password?: string;
  role?: ManageableUserRole;
  is_active?: boolean;
}

export interface ManagedClient {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateClientPayload {
  code: string;
  name: string;
  is_active?: boolean;
}

export interface UpdateClientPayload {
  code?: string;
  name?: string;
  is_active?: boolean;
}

export interface ClientAssignmentList {
  client_id: string;
  users: ManagedUser[];
}

// Konfigurasi Base URL Backend
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const STORAGE_KEYS = {
  ACCESS_TOKEN: "amiga_access_token",
  REFRESH_TOKEN: "amiga_refresh_token",
  USER_DATA: "amiga_user_data",
};

// ==========================================
// Penyimpanan Token & Sesi Lokal (Storage)
// ==========================================

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export function saveStoredTokens(tokens: {
  access_token: string;
  refresh_token: string;
}): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER_DATA);
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEYS.USER_DATA);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveStoredUser(user: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
}

// ==========================================
// Mekanisme Mutex Refresh Token & Antrean Retry
// ==========================================

let isRefreshing = false;
let refreshSubscribers: Array<(newToken: string | null) => void> = [];

function subscribeTokenRefresh(cb: (newToken: string | null) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

/**
 * Melakukan perbaruan access token menggunakan refresh token ke backend /auth/refresh-token.
 */
export async function refreshAccessToken(): Promise<TokenResponse | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) {
    clearStoredAuth();
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });

    if (!response.ok) {
      // Refresh token expired / tidak valid
      clearStoredAuth();
      return null;
    }

    const data: TokenResponse = await response.json();
    saveStoredTokens(data);
    return data;
  } catch (error) {
    console.error("Gagal melakukan refresh token:", error);
    clearStoredAuth();
    return null;
  }
}

// ==========================================
// HTTP Client dengan Interceptor & Auto Retry
// ==========================================

export interface ApiFetchOptions extends RequestInit {
  skipAuth?: boolean;
  _isRetry?: boolean;
}

/**
 * Custom fetch wrapper yang otomatis:
 * 1. Menyertakan header Authorization: Bearer <access_token>
 * 2. Mencegat respons 401 Unauthorized (token kedaluwarsa)
 * 3. Memanggil /auth/refresh-token secara transparan
 * 4. Melakukan retry request yang gagal dengan access token baru
 * 5. Mengarahkan logout jika refresh token juga kedaluwarsa
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { skipAuth = false, _isRetry = false, headers: customHeaders, ...restOptions } = options;

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;

  // Siapkan headers
  const headers = new Headers(customHeaders);
  if (!headers.has("Content-Type") && !(restOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Tambahkan Access Token jika tidak di-skip
  if (!skipAuth) {
    const tokens = getStoredTokens();
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
  }

  const response = await fetch(url, {
    ...restOptions,
    headers,
  });

  // Jika response 401 dan bukan request publik atau retry yang gagal
  if (response.status === 401 && !skipAuth) {
    // Jika endpoint itu sendiri adalah /auth/refresh-token atau /auth/login, jangan coba refresh lagi
    if (endpoint.includes("/auth/refresh-token") || endpoint.includes("/auth/login") || _isRetry) {
      clearStoredAuth();
      const err = await parseErrorResponse(response);
      throw err;
    }

    const currentTokens = getStoredTokens();
    if (!currentTokens?.refreshToken) {
      clearStoredAuth();
      throw new Error("Sesi kedaluwarsa. Silakan masuk kembali.");
    }

    // Tangani concurrent requests saat refresh token sedang berlangsung
    if (isRefreshing) {
      return new Promise<T>((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          if (!newToken) {
            reject(new Error("Sesi kedaluwarsa. Silakan masuk kembali."));
            return;
          }
          try {
            const retryRes = await apiFetch<T>(endpoint, {
              ...options,
              _isRetry: true,
            });
            resolve(retryRes);
          } catch (retryErr) {
            reject(retryErr);
          }
        });
      });
    }

    // Memulai proses refresh token
    isRefreshing = true;

    try {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        onTokenRefreshed(null);
        clearStoredAuth();
        if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = "/login";
        }
        throw new Error("Sesi login Anda telah berakhir. Silakan masuk kembali.");
      }

      // Beritahu semua antrean bahwa token baru sudah siap
      onTokenRefreshed(refreshed.access_token);

      // Retry request yang memicu 401 ini
      return await apiFetch<T>(endpoint, {
        ...options,
        _isRetry: true,
      });
    } catch (err) {
      onTokenRefreshed(null);
      throw err;
    } finally {
      isRefreshing = false;
    }
  }

  // Tangani respons selain 2xx
  if (!response.ok) {
    const errorObj = await parseErrorResponse(response);
    throw errorObj;
  }

  // Jika respons berupa 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

async function parseErrorResponse(response: Response): Promise<Error> {
  try {
    const errorJson = await response.json();
    let message = "Terjadi kesalahan pada server.";
    if (errorJson && typeof errorJson === "object") {
      if (typeof errorJson.detail === "string") {
        message = errorJson.detail;
      } else if (Array.isArray(errorJson.detail)) {
        // FastAPI validation errors
        message = errorJson.detail.map((d: { msg?: string }) => d.msg || "Input tidak valid").join(", ");
      } else if (errorJson.message) {
        message = errorJson.message;
      }
    }
    const err = new Error(message);
    (err as unknown as { status: number }).status = response.status;
    return err;
  } catch {
    const text = await response.text().catch(() => "");
    const err = new Error(text || `Error ${response.status}: ${response.statusText}`);
    (err as unknown as { status: number }).status = response.status;
    return err;
  }
}

// ==========================================
// Layanan Autentikasi Spesifik
// ==========================================

export const authService = {
  /**
   * Mengotentikasi pengguna menggunakan email dan kata sandi ke backend /auth/login.
   */
  async login(email: string, password: string): Promise<TokenResponse> {
    const data = await apiFetch<TokenResponse>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });

    saveStoredTokens(data);

    // Ambil data user yang login (/auth/me)
    try {
      const user = await this.getCurrentUser();
      saveStoredUser(user);
    } catch (e) {
      console.warn("Gagal mengambil data user /auth/me setelah login:", e);
    }

    return data;
  },

  /**
   * Mengambil data profil pengguna yang sedang login via /auth/me.
   */
  async getCurrentUser(): Promise<UserProfile> {
    return apiFetch<UserProfile>("/auth/me", {
      method: "GET",
    });
  },

  /**
   * Memperbarui access token secara manual via refresh-token.
   */
  async refreshToken(): Promise<TokenResponse | null> {
    return refreshAccessToken();
  },

  /**
   * Keluar dari aplikasi dan hapus semua data sesi.
   */
  logout(): void {
    clearStoredAuth();
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  },
};

export const userService = {
  list(skip = 0, limit = 100): Promise<ManagedUser[]> {
    return apiFetch<ManagedUser[]>(`/api/v1/users?skip=${skip}&limit=${limit}`);
  },

  create(payload: CreateUserPayload): Promise<ManagedUser> {
    return apiFetch<ManagedUser>("/api/v1/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(userId: string, payload: UpdateUserPayload): Promise<ManagedUser> {
    return apiFetch<ManagedUser>(`/api/v1/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deactivate(userId: string): Promise<ManagedUser> {
    return apiFetch<ManagedUser>(`/api/v1/users/${userId}`, {
      method: "DELETE",
    });
  },
};

export const clientService = {
  list(skip = 0, limit = 100): Promise<ManagedClient[]> {
    return apiFetch<ManagedClient[]>(`/api/v1/clients?skip=${skip}&limit=${limit}`);
  },

  create(payload: CreateClientPayload): Promise<ManagedClient> {
    return apiFetch<ManagedClient>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  update(clientId: string, payload: UpdateClientPayload): Promise<ManagedClient> {
    return apiFetch<ManagedClient>(`/api/v1/clients/${clientId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deactivate(clientId: string): Promise<ManagedClient> {
    return apiFetch<ManagedClient>(`/api/v1/clients/${clientId}`, {
      method: "DELETE",
    });
  },

  listAssignments(clientId: string): Promise<ClientAssignmentList> {
    return apiFetch<ClientAssignmentList>(`/api/v1/clients/${clientId}/assignments`);
  },

  assignUser(clientId: string, userId: string): Promise<{ user_id: string; client_id: string }> {
    return apiFetch(`/api/v1/clients/${clientId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },

  revokeUser(clientId: string, userId: string): Promise<void> {
    return apiFetch<void>(`/api/v1/clients/${clientId}/assignments/${userId}`, {
      method: "DELETE",
    });
// ==========================================
// Invoice (UC-1, UC-5, UC-6)
// ==========================================

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

/** API error carrying the HTTP status, e.g. 403 for client isolation. */
export type ApiError = Error & { status?: number };

export function errorStatus(error: unknown): number | undefined {
  return (error as ApiError | null)?.status;
}

export const invoiceService = {
  assignedClients(): Promise<AssignedClient[]> {
    return apiFetch<AssignedClient[]>("/api/v1/me/clients");
  },

  list(query: InvoiceListQuery = {}): Promise<InvoicePage> {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value));
    });
    const qs = params.toString();
    return apiFetch<InvoicePage>(`/api/v1/invoices${qs ? `?${qs}` : ""}`);
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
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg || "Input tidak valid").join(", ")
          : `Upload gagal (${response.status}).`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    return response.body as InvoiceUploadResult;
  },
};
