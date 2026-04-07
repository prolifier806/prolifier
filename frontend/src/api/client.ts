/**
 * Base API client.
 * Automatically attaches the Supabase access token to every request.
 * All business-logic calls go through this instead of calling Supabase directly.
 */
import { supabase } from "@/lib/supabase";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// WHY: Without a timeout, fetch can hang indefinitely if the backend is slow/down.
// 30 s covers Render.com free-tier cold starts (backend sleeps after 15 min inactivity
// and takes ~30 s to wake). 15 s was too short and caused spurious abort errors.
const REQUEST_TIMEOUT_MS = 30_000;

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Returns true for AbortErrors — either from our timeout or from navigation-away.
 * Use this in catch blocks to avoid showing a toast for benign cancellations.
 * WHY: When the user navigates away mid-request, or our 30s timeout fires,
 * fetch throws an AbortError with message "signal is aborted without reason".
 * Showing that message as a toast is confusing noise — it is never a real error.
 */
export function isAbortError(err: unknown): boolean {
  return (err as any)?.name === "AbortError";
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

export async function apiGet<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T = null>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handleResponse<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = await getToken();
  // WHY: uploads can be large (up to 200MB for video) — use a much longer timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60_000); // 5 min for uploads
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        // No Content-Type — let the browser set multipart/form-data boundary
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    return handleResponse<T>(res);
  } finally {
    clearTimeout(timeoutId);
  }
}
