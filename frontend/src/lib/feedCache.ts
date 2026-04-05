// src/lib/feedCache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Simple module-level in-memory cache with TTL.
// Survives React re-renders and component unmounts (lives in module scope).
// Cleared automatically on expiry or explicit invalidation.
//
// Usage:
//   feedCache.set("feed-userId", { posts, collabs }, 30_000);
//   const data = feedCache.get<FeedData>("feed-userId");  // null if expired
//   feedCache.invalidate("feed-userId");
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class FeedCache {
  private store = new Map<string, CacheEntry<any>>();

  /**
   * Store data under key with optional TTL (default 30 seconds).
   */
  set<T>(key: string, data: T, ttlMs: number = 30_000): void {
    this.store.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  /**
   * Retrieve data by key. Returns null if missing or expired.
   * Expired entries are removed on access (lazy eviction).
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /**
   * Check if a key exists and is still fresh (without retrieving data).
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Remove a specific key.
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Remove all keys that start with prefix.
   * Useful for invalidating all feed variants for a user.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /**
   * Remove ALL entries (full cache clear).
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache stats for debugging.
   */
  stats(): { size: number; keys: string[] } {
    // Evict expired entries first
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
      }
    }
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Singleton — shared across all components
export const feedCache = new FeedCache();
