import { getRedis } from "./redis";

// ── TTL constants (seconds) ───────────────────────────────────────────────────
export const TTL = {
  PROFILE:      180,  // 3 min  — public profiles change rarely
  GROUP_PUBLIC: 120,  // 2 min  — group metadata (not user-specific join status)
  SEARCH_USERS:  30,  // 30 sec — per-keystroke search; stale blocks tolerable briefly
  DISCOVER:      60,  // 1 min  — base discover page (no filters)
  ADMIN_STATS:  300,  // 5 min  — 7 COUNT queries; admins accept slight staleness
} as const;

// ── Cache key builders ────────────────────────────────────────────────────────
// Centralised here so a rename doesn't silently break invalidation elsewhere.
export const CK = {
  profile:     (id: string)            => `profile:${id}`,
  groupPublic: (id: string)            => `group:public:${id}`,
  searchUsers: (userId: string, q: string) => `search:users:${userId}:${q}`,
  discover:    (userId: string)        => `discover:profiles:${userId}`,
  adminStats:  ()                      => `admin:stats`,
} as const;

// ── Core helpers ──────────────────────────────────────────────────────────────

/** Read from cache. Returns null on miss OR if Redis is unavailable. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await getRedis()?.get<T>(key) ?? null;
  } catch {
    return null; // always fall back to DB
  }
}

/** Write to cache with a TTL. Silently no-ops if Redis is unavailable. */
export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await getRedis()?.set(key, value, { ex: ttl });
  } catch {
    // non-fatal — DB is the source of truth
  }
}

/** Delete one or more exact keys. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    const redis = getRedis();
    if (redis) await redis.del(...keys);
  } catch {
    // non-fatal
  }
}

/**
 * Delete all keys matching a glob pattern (e.g. `search:users:abc123:*`).
 * Uses SCAN so it never blocks the Redis server.
 * Use sparingly — only for user-scoped invalidation on block/unblock.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    let cursor = 0;
    do {
      const [next, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = Number(next);
      if (keys.length) await redis.del(...keys);
    } while (cursor !== 0);
  } catch {
    // non-fatal
  }
}
