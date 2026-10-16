/** Authentication: login, current user, refresh, logout. */

import { apiFetch, refreshAccessToken } from "./client";
import { clearStoredAuth, saveStoredTokens, saveStoredUser } from "./storage";

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
