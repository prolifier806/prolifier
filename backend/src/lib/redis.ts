import { Redis } from "@upstash/redis";

let _client: Redis | null = null;

/**
 * Returns a shared Upstash Redis client, or null if env vars are not set.
 * All callers must handle the null case — Redis is optional infrastructure.
 * If Redis is down or unconfigured, every cache helper falls back to the DB.
 */
export function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!_client) {
    _client = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _client;
}
