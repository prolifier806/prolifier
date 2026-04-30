import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

/**
 * Short-lived cache keyed by the raw access token.
 * Eliminates the supabaseAdmin.auth.getUser() network call for back-to-back
 * requests that arrive with the same token (typical within a single page load).
 * TTL is 60s — well under the 1-hour token lifetime, so expired tokens are
 * never served from cache.
 */
interface CachedToken {
  userId: string;
  email: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const TOKEN_CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getCachedToken(token: string): CachedToken | null {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(token);
    return null;
  }
  return entry;
}

function setCachedToken(token: string, userId: string, email: string): void {
  tokenCache.set(token, { userId, email, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  // Evict stale entries if cache grows large
  if (tokenCache.size > 5_000) {
    const now = Date.now();
    for (const [t, entry] of tokenCache) {
      if (now > entry.expiresAt) tokenCache.delete(t);
      if (tokenCache.size <= 4_000) break;
    }
  }
}

/**
 * In-memory profile cache — avoids a DB round-trip on every authenticated request.
 * WHY: Without this, every API call fires 2 DB queries (auth.getUser + profiles.select).
 * At 1000 concurrent users that's 2000 DB queries/sec just for auth.
 *
 * Two TTLs:
 *   - role: 5 minutes (role changes are rare, higher DB savings)
 *   - account_status: 1 minute (bans must take effect quickly)
 */
interface CachedProfile {
  role: string;
  accountStatus: string;
  expiresAt: number;
}
const profileCache = new Map<string, CachedProfile>();
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const BAN_CACHE_TTL_MS  = 1 * 60 * 1000;   // 1 minute — bans propagate within 60s

function getCachedProfile(userId: string): CachedProfile | null {
  const entry = profileCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    profileCache.delete(userId);
    return null;
  }
  return entry;
}

function setCachedProfile(userId: string, role: string, accountStatus: string): void {
  // Use the shorter TTL when account is banned so unban is also reflected quickly
  const ttl = accountStatus === "banned" ? BAN_CACHE_TTL_MS : ROLE_CACHE_TTL_MS;
  profileCache.set(userId, { role, accountStatus, expiresAt: Date.now() + ttl });
  // Prevent unbounded growth — evict expired entries if cache exceeds 10k
  if (profileCache.size > 10_000) {
    const now = Date.now();
    for (const [id, entry] of profileCache) {
      if (now > entry.expiresAt) profileCache.delete(id);
      if (profileCache.size <= 8_000) break;
    }
  }
}

/** Call this when a user's role or ban status changes to force an immediate re-fetch */
export function invalidateRoleCache(userId: string): void {
  profileCache.delete(userId);
}

/**
 * Verifies the Supabase JWT from the Authorization header.
 * Attaches the decoded user to req.user.
 *
 * Frontend must send: Authorization: Bearer <supabase_access_token>
 */
export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // Fast path: use cached identity if the same token was verified recently.
  // auth.getUser() makes an HTTP call to Supabase Auth on every request —
  // this cache eliminates that call for the vast majority of back-to-back requests.
  let userId: string;
  let userEmail: string;

  const cachedToken = getCachedToken(token);
  if (cachedToken) {
    userId = cachedToken.userId;
    userEmail = cachedToken.email;
  } else {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }

    userId = data.user.id;
    userEmail = data.user.email ?? "";
    setCachedToken(token, userId, userEmail);
  }

  // Use cached profile if fresh — avoids a DB query on every request
  let cached = getCachedProfile(userId);

  if (!cached) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, account_status, permanently_deleted")
      .eq("id", userId)
      .single();
    const role = (profile?.role as string | undefined) ?? "user";
    const accountStatus = (profile?.account_status as string | undefined) ?? "active";
    const permanentlyDeleted = !!(profile as any)?.permanently_deleted;

    if (permanentlyDeleted) {
      // Ban the auth account so they can never sign in again
      await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876600h" }).catch(() => {});
      res.status(403).json({ success: false, error: "This account has been permanently deleted." });
      return;
    }

    setCachedProfile(userId, role, accountStatus);
    cached = { role, accountStatus, expiresAt: 0 };
  }

  // Reject banned accounts at the API boundary
  if (cached.accountStatus === "banned") {
    res.status(403).json({ success: false, error: "Your account has been suspended." });
    return;
  }

  req.user = {
    id: userId,
    email: userEmail,
    role: cached.role,
  };

  next();
}
