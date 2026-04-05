// src/lib/queryWithTimeout.ts
// ─────────────────────────────────────────────────────────────────────────────
// Wraps a Supabase query promise with a timeout.
// Prevents infinite loading states when the database is overloaded.
//
// Usage:
//   const result = await queryWithTimeout(
//     supabase.from("posts").select(...),
//     8000,   // 8 second timeout
//     []      // fallback value if timeout
//   );
// ─────────────────────────────────────────────────────────────────────────────

export interface QueryResult<T> {
  data: T | null;
  error: any;
  timedOut?: boolean;
}

/**
 * Race a Supabase query against a timeout.
 * Returns the fallback value (not an error) if the timeout fires first,
 * so the UI can render with empty/cached data rather than showing an error.
 *
 * @param queryPromise  The Supabase query (e.g. supabase.from(...).select(...))
 * @param timeoutMs     Max milliseconds to wait (default: 8000)
 * @param fallback      Value to return as `data` on timeout (default: null)
 */
export async function queryWithTimeout<T>(
  queryPromise: Promise<{ data: T | null; error: any }>,
  timeoutMs: number = 8_000,
  fallback: T | null = null
): Promise<QueryResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<QueryResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        data: fallback,
        error: { message: `Request timed out after ${timeoutMs}ms` },
        timedOut: true,
      });
    }, timeoutMs);
  });

  const queryWithCleanup = queryPromise.then((result) => {
    clearTimeout(timeoutId);
    return { ...result, timedOut: false as const };
  });

  return Promise.race([queryWithCleanup, timeoutPromise]);
}

/**
 * Run multiple queries with a shared timeout.
 * If ANY query exceeds the timeout, ALL results are returned
 * (completed ones with real data, pending ones with fallback).
 *
 * Useful for the feed's parallel fetch batch.
 */
export async function batchWithTimeout<T extends any[]>(
  queries: { [K in keyof T]: Promise<{ data: T[K] | null; error: any }> },
  timeoutMs: number = 10_000,
  fallbacks: { [K in keyof T]: T[K] | null }
): Promise<{ [K in keyof T]: QueryResult<T[K]> }> {
  const withTimeouts = queries.map((q, i) =>
    queryWithTimeout(q as any, timeoutMs, (fallbacks as any)[i])
  );
  return Promise.all(withTimeouts) as any;
}
