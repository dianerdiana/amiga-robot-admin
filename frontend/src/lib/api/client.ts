/** HTTP client: bearer auth, transparent token refresh on 401, and retry. */

import type { TokenResponse } from "./auth";
import { API_BASE_URL } from "./config";
import { parseErrorResponse } from "./errors";
import { clearStoredAuth, getStoredTokens, saveStoredTokens } from "./storage";

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

/** Append the defined, non-empty params as a query string. */
export function withQuery(path: string, params: object): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
