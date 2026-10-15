"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { homeForRole } from "@/lib/navigation";

export default function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Validasi inline email
  const validateEmail = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      setEmailError("Email wajib diisi.");
      return false;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmed)) {
      setEmailError("Format email tidak valid. Masukkan alamat email yang benar.");
      return false;
    }
    setEmailError("");
    return true;
  };

  // Validasi inline kata sandi
  const validatePassword = (val: string) => {
    if (!val) {
      setPasswordError("Kata sandi wajib diisi.");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    if (emailError) {
      validateEmail(val);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPassword(val);
    if (passwordError) {
      validatePassword(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    setIsLoading(true);

    try {
      const authenticatedUser = await login(email.trim(), password);
      router.replace(homeForRole(authenticatedUser.role));
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Email atau kata sandi yang Anda masukkan salah. Periksa kembali dan coba lagi.";
      setAuthError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      {/* Top Minimal Branding Bar */}
      <header className="w-full h-14 bg-white border-b border-[#CBD5E1] px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-md bg-[#1E3A8A] flex items-center justify-center text-white shrink-0 shadow-sm"
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <circle cx="12" cy="5" r="2"></circle>
              <path d="M12 7v4"></path>
              <line x1="8" y1="16" x2="8" y2="16"></line>
              <line x1="16" y1="16" x2="16" y2="16"></line>
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-[15px] tracking-tight text-[#0F172A]">
              AMIGA
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1]">
              Robot Admin
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#475569]">
          <span
            className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
            aria-hidden="true"
          ></span>
          <span className="hidden sm:inline font-medium">
            Sistem Operasional v1.0
          </span>
          <span className="sm:hidden font-medium">v1.0</span>
        </div>
      </header>

      {/* Main Viewport Area */}
      <main className="flex-1 flex items-center justify-center p-3 sm:p-6 w-full max-w-[1366px] mx-auto">
        {/* Centered Login Card */}
        <div className="w-full max-w-[420px] bg-white rounded-lg border border-[#CBD5E1] shadow-md p-6 sm:p-8 relative">
          {/* Card Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#E0E7FF] text-[#1E3A8A] mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
              Masuk ke AMIGA Robot
            </h1>
            <p className="text-sm text-[#475569] mt-1.5 leading-snug">
              Pengelolaan invoice dan voucher internal
            </p>
          </div>

          {/* Authentication Error Banner */}
          {authError && (
            <div
              id="authErrorBanner"
              className="mb-5 p-3.5 rounded-md bg-[#FEE2E2] border border-[#B91C1C] text-[#991B1B] text-xs leading-relaxed transition-all"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-2.5">
                <svg
                  className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  ></path>
                </svg>
                <div className="flex-1">
                  <span className="font-semibold block text-[13px]">
                    Kredensial tidak valid
                  </span>
                  <span id="authErrorMessage" className="mt-0.5 block">
                    {authError}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthError(null)}
                  className="text-[#991B1B] hover:text-[#7F1D1D] p-1 -mr-1 -mt-1 rounded focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  aria-label="Tutup pesan error"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Field Email */}
            <div>
              <label
                htmlFor="emailInput"
                className="block text-xs font-semibold uppercase tracking-wider text-[#0F172A] mb-1.5"
              >
                Email <span className="text-[#B91C1C]" aria-hidden="true">*</span>
                <span className="sr-only">(wajib)</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  id="emailInput"
                  name="email"
                  tabIndex={1}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  placeholder="nama@perusahaan.co.id"
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={() => validateEmail(email)}
                  className={`w-full h-10 px-3 bg-white border rounded-md text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1E3A8A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1 transition-colors ${
                    emailError ? "border-[#B91C1C]" : "border-[#94A3B8]"
                  } ${isLoading ? "bg-[#F1F5F9] cursor-not-allowed" : ""}`}
                  aria-describedby="emailError emailHelper"
                />
              </div>
              {/* Inline Error Message */}
              {emailError && (
                <p
                  id="emailError"
                  className="text-xs text-[#B91C1C] mt-1.5 flex items-center gap-1.5 font-medium"
                  role="alert"
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span id="emailErrorText">{emailError}</span>
                </p>
              )}
              <p id="emailHelper" className="text-[11px] text-[#475569] mt-1">
                Gunakan alamat email resmi staf internal AMIGA.
              </p>
            </div>

            {/* Field Kata Sandi */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="passwordInput"
                  className="block text-xs font-semibold uppercase tracking-wider text-[#0F172A]"
                >
                  Kata Sandi
                  <span className="text-[#B91C1C]" aria-hidden="true">*</span>
                  <span className="sr-only">(wajib)</span>
                </label>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  id="passwordInput"
                  name="password"
                  tabIndex={2}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi Anda"
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={() => validatePassword(password)}
                  className={`w-full h-10 pl-3 pr-11 bg-white border rounded-md text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1E3A8A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1 transition-colors font-mono tracking-normal ${
                    passwordError ? "border-[#B91C1C]" : "border-[#94A3B8]"
                  } ${isLoading ? "bg-[#F1F5F9] cursor-not-allowed" : ""}`}
                  aria-describedby="passwordError"
                />
                {/* Password Visibility Toggle */}
                <button
                  type="button"
                  id="togglePasswordBtn"
                  tabIndex={3}
                  disabled={isLoading}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-[#475569] hover:text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-1 rounded-r-md touch-target"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  title={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? (
                    // Eye Icon
                    <svg
                      id="eyeIcon"
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      ></path>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      ></path>
                    </svg>
                  ) : (
                    // Eye Slash Icon
                    <svg
                      id="eyeSlashIcon"
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      ></path>
                    </svg>
                  )}
                </button>
              </div>
              {/* Inline Error Message */}
              {passwordError && (
                <p
                  id="passwordError"
                  className="text-xs text-[#B91C1C] mt-1.5 flex items-center gap-1.5 font-medium"
                  role="alert"
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    ></path>
                  </svg>
                  <span id="passwordErrorText">{passwordError}</span>
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                id="submitBtn"
                tabIndex={4}
                disabled={isLoading}
                className="w-full h-10 px-4 bg-[#1E3A8A] hover:bg-[#1B3380] active:bg-[#172B6B] disabled:bg-[#E2E8F0] disabled:text-[#94A3B8] disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md shadow-sm transition-colors duration-150 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 touch-target cursor-pointer"
              >
                {isLoading && (
                  <svg
                    id="submitSpinner"
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    ></path>
                  </svg>
                )}
                <span id="submitText">
                  {isLoading ? "Memverifikasi..." : "Masuk"}
                </span>
              </button>
            </div>
          </form>

          {/* Roles Access Notice Footer */}
          <div className="mt-6 pt-5 border-t border-[#CBD5E1] text-center">
            <p className="text-xs text-[#475569] leading-relaxed">
              Hak akses dan menu navigasi ditentukan otomatis sesuai peran Anda:
              <br />
              <span className="font-medium text-[#0F172A]">Intake</span>,{" "}
              <span className="font-medium text-[#0F172A]">
                Finance Reviewer
              </span>
              , <span className="font-medium text-[#0F172A]">Service Lead</span>
              , atau{" "}
              <span className="font-medium text-[#0F172A]">System Admin</span>.
            </p>
          </div>
        </div>
      </main>

      {/* Global Footer */}
      <footer className="w-full py-4 px-4 text-center text-xs text-[#475569] border-t border-[#CBD5E1] bg-white">
        <div className="max-w-[1366px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 AMIGA. Khusus penggunaan internal staf yang berwenang.</p>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span>ID Perangkat: DEV-1366X</span>
            <span>Akses Terenkripsi</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
