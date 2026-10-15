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
  _includeHeaders?: boolean;
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
  const { skipAuth = false, _isRetry = false, _includeHeaders = false, headers: customHeaders, ...restOptions } = options;

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
    return (_includeHeaders ? { data: {}, headers: response.headers } : {}) as T;
  }

  const json = (await response.json()) as T;
  if (_includeHeaders) {
    return { data: json, headers: response.headers } as unknown as T;
  }
  return json;
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
