import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

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

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
    return;
  }

  const userId = data.user.id;

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
    setCachedProfile(userId, role, permanentlyDeleted ? "banned" : accountStatus);
    cached = { role, accountStatus: permanentlyDeleted ? "banned" : accountStatus, expiresAt: 0 };
  }

  // Reject banned/permanently-deleted accounts at the API boundary
  if (cached.accountStatus === "banned") {
    res.status(403).json({ success: false, error: "Your account has been suspended." });
    return;
  }

  req.user = {
    id: userId,
    email: data.user.email ?? "",
    role: cached.role,
  };

  next();
}
