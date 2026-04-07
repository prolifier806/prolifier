/**
 * Base API client.
 * Automatically attaches the Supabase access token to every request.
 * All business-logic calls go through this instead of calling Supabase directly.
 */
import { supabase } from "@/lib/supabase";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ── Keep-alive ping — prevents Render free-tier backend from sleeping ─────────
// WHY: Render free tier sleeps after 15 min of inactivity. The wake-up takes
// ~30s and returns a 502, which the browser reports as a CORS error (no headers
// from our app). Pinging /health every 4 minutes keeps it warm for active users.
// Only runs in production and stops when the tab is hidden.
if (typeof window !== "undefined" && import.meta.env.PROD) {
  const ping = () => {
    if (document.visibilityState === "visible") {
      fetch(`${API_URL}/health`, { method: "GET" }).catch(() => {});
    }
  };
  setInterval(ping, 4 * 60 * 1000); // every 4 minutes
}

// WHY: Without a timeout, fetch can hang indefinitely if the backend is slow/down.
// 30 s covers Render.com free-tier cold starts (backend sleeps after 15 min inactivity
// and takes ~30 s to wake). 15 s was too short and caused spurious abort errors.
const REQUEST_TIMEOUT_MS = 30_000;

// WHY: Always force-refresh the token when returning after long inactivity.
// getSession() returns the cached token without validating expiry against the server.
// refreshSession() gets a fresh token using the refresh_token (which lasts weeks).
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  // Proactively refresh if token expires within 5 minutes
  const expiresAt = session.expires_at ?? 0; // unix seconds
  const secsUntilExpiry = expiresAt - Math.floor(Date.now() / 1000);
  if (secsUntilExpiry < 300) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session) return refreshed.session.access_token;
  }

  return session.access_token;
}

// Force-refresh token once — used for 401 retry
async function forceRefreshToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

/**
 * Returns true for AbortErrors — either from our timeout or from navigation-away.
 * Use this in catch blocks to avoid showing a toast for benign cancellations.
 * WHY: When the user navigates away mid-request, or our 30s timeout fires,
 * fetch throws an AbortError with message "signal is aborted without reason".
 * Showing that message as a toast is confusing noise — it is never a real error.
 * WHY message fallback: Some browsers / Supabase internals throw a generic Error
 * (not DOMException) with name "Error" but message "signal is aborted without reason",
 * so checking only name misses those cases.
 */
export function isAbortError(err: unknown): boolean {
  if ((err as any)?.name === "AbortError") return true;
  const msg: string = (err as any)?.message ?? "";
  return msg.includes("signal is aborted") || msg.includes("aborted without reason") || msg.includes("Request timed out or was cancelled");
}

/**
 * Fetch wrapper with AbortController timeout.
 * WHY: The browser has no built-in fetch timeout. A single stalled request
 * can block UX indefinitely. 30s covers Render.com cold starts.
 */
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      // Re-throw a clean AbortError — the default message "signal is aborted
      // without reason" would show up verbatim in toasts across every page.
      const clean = new DOMException("Request timed out or was cancelled", "AbortError");
      throw clean;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  // WHY: Previously only checked json.success, ignoring HTTP status codes.
  // A 401/403/429 response would silently pass through if the body had success:false
  // but an unexpected HTML error page (e.g. from a CDN) would crash on .json() parse.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected response (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Core request helper with automatic 401 retry.
 * WHY: After long inactivity the cached token may be expired. If the first
 * request returns 401 we force-refresh the session and retry once.
 */
async function request(url: string, options: RequestInit): Promise<Response> {
  let res = await fetchWithTimeout(url, options);

  if (res.status === 401) {
    // Token expired — force refresh and retry once
    const freshToken = await forceRefreshToken();
    if (freshToken) {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${freshToken}`);
      res = await fetchWithTimeout(url, { ...options, headers });
    }
  }

  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T = null>(path: string): Promise<T> {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
  });
  return handleResponse<T>(res);
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await request(`${API_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await getToken();
  // WHY: uploads can be large (up to 200MB for video) — use a much longer timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60_000); // 5 min for uploads
  try {
    let res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        // No Content-Type — let the browser set multipart/form-data boundary
        ...authHeaders(token),
      },
      body: formData,
      signal: controller.signal,
    });
    // Retry once on 401 for uploads too
    if (res.status === 401) {
      const freshToken = await forceRefreshToken();
      if (freshToken) {
        res = await fetch(`${API_URL}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${freshToken}` },
          body: formData,
          signal: controller.signal,
        });
      }
    }
    return handleResponse<T>(res);
  } finally {
    clearTimeout(timeoutId);
  }
}
