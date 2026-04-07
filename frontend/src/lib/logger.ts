/**
 * Prolifier — Centralized Structured Logger + Query Tracer
 *
 * Outputs newline-delimited JSON to the console so it can be:
 *   - Read in browser DevTools (structured, filterable)
 *   - Captured by k6's `handleSummary` or a browser-log exporter
 *   - Piped to any log aggregator (Datadog, Loki, CloudWatch) via a proxy
 *
 * Usage:
 *   import { logger, traceQuery } from "@/lib/logger";
 *
 *   // Emit a named log event
 *   logger.info("feed.load", { userId, postCount: 30 });
 *   logger.warn("messages.fetch", { message: "no conversations found" });
 *   logger.error("notifications.insert", { error: err.message });
 *
 *   // Wrap a Supabase query and get timing + row count automatically
 *   const { data, error } = await traceQuery("feed.posts", () =>
 *     supabase.from("posts").select(...).limit(30)
 *   );
 */

// ── Types ─────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error" | "perf";

export interface LogEntry {
  ts: string;          // ISO 8601 timestamp
  level: LogLevel;
  event: string;       // dot-namespaced event name, e.g. "feed.posts.fetch"
  traceId: string;     // session-scoped random ID — correlates all logs for one page load
  durationMs?: number; // query / operation duration in milliseconds
  rowCount?: number;   // rows returned by a query
  userId?: string;     // current authenticated user (set via logger.setUserId)
  [key: string]: unknown; // arbitrary structured fields
}

// ── Internal state ────────────────────────────────────────────────────────

let _traceId: string = generateTraceId();
let _userId: string | undefined;
let _minLevel: LogLevel = import.meta.env.DEV ? "debug" : "warn";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  perf:  2,
  warn:  3,
  error: 4,
};

// In-memory ring buffer — last 500 log entries accessible via logger.getBuffer()
const _buffer: LogEntry[] = [];
const BUFFER_SIZE = 500;

// Running totals — exported as metrics snapshot for k6 / dashboards
const _metrics: Record<string, { count: number; totalMs: number; errors: number; maxMs: number }> = {};

// ── Helpers ───────────────────────────────────────────────────────────────

function generateTraceId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[_minLevel];
}

function emit(entry: LogEntry): void {
  _buffer.push(entry);
  if (_buffer.length > BUFFER_SIZE) _buffer.shift();

  if (!shouldLog(entry.level)) return;

  // Styled console output — keeps DevTools readable
  const prefix = `[${entry.level.toUpperCase().padEnd(5)}] [${entry.traceId}] ${entry.event}`;
  const details: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!["ts", "level", "event", "traceId"].includes(k)) details[k] = v;
  }

  switch (entry.level) {
    case "error": console.error(prefix, details); break;
    case "warn":  console.warn(prefix, details); break;
    case "perf":  console.info(`%c${prefix}`, "color:#a78bfa", details); break;
    case "debug": console.debug(prefix, details); break;
    default:      console.info(prefix, details);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export const logger = {
  /** Set the current authenticated user ID so all future logs include it */
  setUserId(id: string | undefined) {
    _userId = id;
  },

  /** Rotate the trace ID — call on each page navigation or major state reset */
  newTrace() {
    _traceId = generateTraceId();
    return _traceId;
  },

  /** Set minimum log level. In production you can raise to "warn" to reduce noise. */
  setLevel(level: LogLevel) {
    _minLevel = level;
  },

  debug(event: string, fields?: Record<string, unknown>) {
    emit({ ts: new Date().toISOString(), level: "debug", event, traceId: _traceId, userId: _userId, ...fields });
  },

  info(event: string, fields?: Record<string, unknown>) {
    emit({ ts: new Date().toISOString(), level: "info", event, traceId: _traceId, userId: _userId, ...fields });
  },

  warn(event: string, fields?: Record<string, unknown>) {
    emit({ ts: new Date().toISOString(), level: "warn", event, traceId: _traceId, userId: _userId, ...fields });
  },

  error(event: string, fields?: Record<string, unknown>) {
    emit({ ts: new Date().toISOString(), level: "error", event, traceId: _traceId, userId: _userId, ...fields });
  },

  /** Emit a performance metric — always included in getMetrics() snapshot */
  perf(event: string, durationMs: number, fields?: Record<string, unknown>) {
    // Accumulate into metrics map
    if (!_metrics[event]) _metrics[event] = { count: 0, totalMs: 0, errors: 0, maxMs: 0 };
    _metrics[event].count++;
    _metrics[event].totalMs += durationMs;
    if (durationMs > _metrics[event].maxMs) _metrics[event].maxMs = durationMs;

    emit({
      ts: new Date().toISOString(),
      level: "perf",
      event,
      traceId: _traceId,
      userId: _userId,
      durationMs,
      ...fields,
    });
  },

  /** Record an error against a metric key (e.g. when a query fails) */
  perfError(event: string, errorMsg: string, fields?: Record<string, unknown>) {
    if (!_metrics[event]) _metrics[event] = { count: 0, totalMs: 0, errors: 0, maxMs: 0 };
    _metrics[event].errors++;
    emit({
      ts: new Date().toISOString(),
      level: "error",
      event,
      traceId: _traceId,
      userId: _userId,
      error: errorMsg,
      ...fields,
    });
  },

  /**
   * Returns the current aggregated metrics snapshot.
   * Copy this from the browser console during a k6 run:
   *   copy(JSON.stringify(logger.getMetrics(), null, 2))
   */
  getMetrics(): Record<string, { count: number; avgMs: number; maxMs: number; errors: number; errorRate: string }> {
    const out: Record<string, { count: number; avgMs: number; maxMs: number; errors: number; errorRate: string }> = {};
    for (const [key, m] of Object.entries(_metrics)) {
      out[key] = {
        count:     m.count,
        avgMs:     m.count > 0 ? Math.round(m.totalMs / m.count) : 0,
        maxMs:     Math.round(m.maxMs),
        errors:    m.errors,
        errorRate: m.count > 0 ? `${((m.errors / m.count) * 100).toFixed(1)}%` : "0%",
      };
    }
    return out;
  },

  /** Returns the last N log entries from the in-memory ring buffer */
  getBuffer(n = 100): LogEntry[] {
    return _buffer.slice(-n);
  },

  /** Print a human-readable metrics table to the console */
  printMetrics() {
    const m = this.getMetrics();
    console.table(m);
    return m;
  },

  /** Reset all accumulated metrics (useful between k6 test scenarios) */
  resetMetrics() {
    Object.keys(_metrics).forEach(k => delete _metrics[k]);
    _buffer.length = 0;
    _traceId = generateTraceId();
  },
};

// ── Query Tracer ──────────────────────────────────────────────────────────

type SupabaseQueryFn<T> = () => PromiseLike<{ data: T | null; error: { message: string } | null; count?: number | null }>;

/**
 * Wraps a Supabase query, measures its duration, logs it, and returns
 * the original response unchanged. Drop-in replacement for raw calls.
 *
 * @param event   Dot-namespaced label, e.g. "feed.posts.fetch"
 * @param queryFn Zero-arg function that returns the Supabase query promise
 * @param meta    Optional extra fields to include in the log (e.g. { limit: 30 })
 *
 * @example
 *   const { data, error } = await traceQuery("feed.posts", () =>
 *     supabase.from("posts").select("...").limit(30)
 *   );
 */
export async function traceQuery<T>(
  event: string,
  queryFn: SupabaseQueryFn<T>,
  meta?: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const start = performance.now();
  const result = await queryFn();
  const durationMs = Math.round(performance.now() - start);

  const rowCount = Array.isArray(result.data) ? result.data.length : (result.data ? 1 : 0);

  if (result.error) {
    logger.perfError(event, result.error.message, { durationMs, ...meta });
  } else {
    logger.perf(event, durationMs, { rowCount, ...meta });

    // Warn on suspiciously slow queries
    if (durationMs > 2000) {
      logger.warn(`${event}.slow`, { durationMs, rowCount, threshold: 2000, ...meta });
    }
  }

  return result;
}

/**
 * Convenience: run multiple named queries in parallel and trace each one.
 *
 * @example
 *   const [postsRes, collabsRes] = await traceParallel([
 *     ["feed.posts",  () => supabase.from("posts").select(...).limit(30)],
 *     ["feed.collabs",() => supabase.from("collabs").select(...).limit(30)],
 *   ]);
 */
export async function traceParallel<T extends unknown[]>(
  queries: { [K in keyof T]: [string, SupabaseQueryFn<T[K]>, Record<string, unknown>?] }
): Promise<{ [K in keyof T]: { data: T[K] | null; error: { message: string } | null } }> {
  return Promise.all(
    (queries as [string, SupabaseQueryFn<unknown>, Record<string, unknown>?][]).map(
      ([event, fn, meta]) => traceQuery(event, fn, meta)
    )
  ) as any;
}

// ── Connection Pool Monitor ───────────────────────────────────────────────
// Supabase JS uses HTTP/2 keep-alive through the browser's fetch.
// This tracks concurrent in-flight requests — a proxy for "pool pressure".

let _inflight = 0;
let _inflightPeak = 0;

export function trackInflight<T>(fn: () => Promise<T>): Promise<T> {
  _inflight++;
  if (_inflight > _inflightPeak) {
    _inflightPeak = _inflight;
    if (_inflight >= 6) {
      logger.warn("connection.pool.pressure", {
        inflight: _inflight,
        peak: _inflightPeak,
        note: "Browser HTTP/2 is saturated — requests are queuing",
      });
    }
  }
  return fn().finally(() => { _inflight--; });
}

export function getInflightStats() {
  return { current: _inflight, peak: _inflightPeak };
}

// ── Expose on window ONLY in development for console debugging ───────────────
// WHY: Exposing internal logger on window in production leaks user IDs, trace IDs,
// query patterns, and error messages to anyone who opens DevTools.
if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as any).__prolifierLogger = logger;
  (window as any).__prolifierInflight = getInflightStats;
}
