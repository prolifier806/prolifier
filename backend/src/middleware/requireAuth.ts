import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

/**
 * In-memory role cache — avoids a DB round-trip on every authenticated request.
 * WHY: Without this, every API call fires 2 DB queries (auth.getUser + profiles.select).
 * At 1000 concurrent users that's 2000 DB queries/sec just for auth.
 * Cache TTL: 5 minutes — stale enough to save DB load, fresh enough to pick up role changes.
 */
interface CachedRole {
  role: string;
  expiresAt: number;
}
const roleCache = new Map<string, CachedRole>();
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedRole(userId: string): string | null {
  const entry = roleCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    roleCache.delete(userId);
    return null;
  }
  return entry.role;
}

function setCachedRole(userId: string, role: string): void {
  roleCache.set(userId, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  // Prevent unbounded growth — evict if cache exceeds 10k entries
  if (roleCache.size > 10_000) {
    const now = Date.now();
    for (const [id, entry] of roleCache) {
      if (now > entry.expiresAt) roleCache.delete(id);
      if (roleCache.size <= 8_000) break;
    }
  }
}

/** Call this when a user's role changes (admin panel, ban, etc.) to force re-fetch */
export function invalidateRoleCache(userId: string): void {
  roleCache.delete(userId);
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

  // Use cached role if fresh — avoids a DB query on every request
  let role: string = getCachedRole(userId) ?? "";

  if (!role) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();
    role = (profile?.role as string | undefined) ?? "user";
    setCachedRole(userId, role);
  }

  req.user = {
    id: userId,
    email: data.user.email ?? "",
    role,
  };

  next();
}
