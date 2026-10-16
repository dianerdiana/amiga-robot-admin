/**
 * Backend base URL from NEXT_PUBLIC_API_URL (inlined at build time). Required, no fallback:
 * an empty value is an explicit choice meaning same-origin requests through the reverse proxy.
 */
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (apiUrl === undefined) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not set. Set it in frontend/.env.local (see .env.example), or to an empty value for same-origin."
  );
}

export const API_BASE_URL = apiUrl.replace(/\/+$/, "");
