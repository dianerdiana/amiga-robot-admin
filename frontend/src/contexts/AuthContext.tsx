"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  UserProfile,
  authService,
  getStoredTokens,
  getStoredUser,
  saveStoredUser,
  clearStoredAuth,
} from "@/lib/api";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<UserProfile | null>;
  simulateExpiredTokenRetry: () => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Inisialisasi status user dari local storage & verifikasi token ke /auth/me
  useEffect(() => {
    async function initAuth() {
      const tokens = getStoredTokens();
      if (!tokens?.accessToken) {
        setIsLoading(false);
        return;
      }

      // Gunakan cache user dulu untuk immediate render jika ada
      const cachedUser = getStoredUser();
      if (cachedUser) {
        setUser(cachedUser);
      }

      // Verifikasi token aktif & ambil data profil terbaru (akan auto-refresh jika expired)
      try {
        const freshUser = await authService.getCurrentUser();
        setUser(freshUser);
        saveStoredUser(freshUser);
      } catch (error) {
        console.warn("Gagal inisialisasi sesi pengguna:", error);
        setUser(null);
        clearStoredAuth();
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      await authService.login(email, password);
      const profile = await authService.getCurrentUser();
      setUser(profile);
      saveStoredUser(profile);
      return profile;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    authService.logout();
  }, []);

  const refreshUser = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const profile = await authService.getCurrentUser();
      setUser(profile);
      saveStoredUser(profile);
      return profile;
    } catch (e) {
      console.error("Gagal memperbarui profil pengguna:", e);
      return null;
    }
  }, []);

  /**
   * Fungsi uji coba: Merusak access token di localStorage untuk mensimulasikan
   * access token yang telah expired, lalu memanggil /auth/me.
   * Interceptor akan menangkap 401, memanggil /auth/refresh-token,
   * memperbarui access token baru, dan berhasil mengambil data profil!
   */
  const simulateExpiredTokenRetry = useCallback(async (): Promise<UserProfile> => {
    if (typeof window !== "undefined") {
      // Simulasikan token basi / invalid
      localStorage.setItem("amiga_access_token", "expired_dummy_access_token");
    }
    // Panggil getCurrentUser -> Interceptor akan otomatis menangani 401 dan melakukan refresh & retry
    const res = await authService.getCurrentUser();
    setUser(res);
    saveStoredUser(res);
    return res;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
        simulateExpiredTokenRetry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth harus digunakan di dalam AuthProvider");
  }
  return context;
}
