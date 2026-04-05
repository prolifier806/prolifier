// src/lib/supabase.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase client with:
// - 10-second fetch timeout (prevents infinite hanging requests)
// - Web Locks bypass (avoids 5s initialization freeze on new tabs)
// - Explicit client identification for Supabase logs
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

/**
 * Custom fetch wrapper that aborts requests after 10 seconds.
 * Without this, a single overloaded DB query can hang the entire tab
 * because the browser's default fetch has no timeout.
 */
function fetchWithTimeout(
  url: RequestInfo | URL,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();

  // Don't apply timeout to realtime WebSocket upgrades
  const urlStr = url.toString();
  const isRealtime =
    urlStr.includes("/realtime/") || urlStr.includes("websocket");

  if (isRealtime) {
    return fetch(url, options);
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10_000); // 10 second timeout for all DB/auth requests

  return fetch(url, {
    ...options,
    signal: options.signal ?? controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    storageKey: "prolifier_auth_v1",
    // Bypass Web Locks to prevent 5s freeze when a new tab initializes
    // while another tab holds the lock. Token refresh races are idempotent
    // on the Supabase server side.
    lock: (_name, _timeout, fn) => fn(),
  },
  global: {
    headers: {
      // Visible in Supabase dashboard logs — helps identify client versions
      "x-client-info": "prolifier-web/1.0",
    },
    fetch: fetchWithTimeout,
  },
  realtime: {
    params: {
      // Reduce realtime heartbeat frequency to lower connection overhead
      heartbeatIntervalMs: 30_000, // default is 15s; 30s halves heartbeat traffic
    },
  },
});
