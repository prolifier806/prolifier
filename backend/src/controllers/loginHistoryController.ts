import { Request, Response } from "express";
import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import { supabaseAdmin } from "../lib/supabase";
import { emitToUser, emitToUserExcept } from "../lib/socketServer";
import type { AuthRequest } from "../middleware/requireAuth";

// Private IPs — skip GeoIP lookup for these
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/;

async function geoLookup(ip: string): Promise<{ country: string | null; city: string | null }> {
  if (!ip || PRIVATE_IP_RE.test(ip)) return { country: null, city: null };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json() as any;
    if (json.status === "success") return { country: json.country ?? null, city: json.city ?? null };
  } catch { /* timeout or network error — best-effort only */ }
  return { country: null, city: null };
}

function parseUA(uaString: string) {
  const parser = new UAParser(uaString);
  const browser    = parser.getBrowser().name   ?? "Unknown";
  const os         = parser.getOS().name        ?? "Unknown";
  const rawDevice  = parser.getDevice().type;
  const deviceType = rawDevice === "mobile" ? "mobile" : rawDevice === "tablet" ? "tablet" : "desktop";
  return { browser, os, deviceType };
}

function deviceFingerprint(uaString: string, os: string, browser: string, ip: string): string {
  // Partial IP (first 3 octets) so a DHCP reassignment on the same subnet still matches
  const partialIp = ip.split(".").slice(0, 3).join(".");
  return crypto.createHash("sha256")
    .update(`${uaString}|${os}|${browser}|${partialIp}`)
    .digest("hex")
    .slice(0, 32);
}

// ── POST /api/login-history/track ─────────────────────────────────────────────
// Called by frontend immediately after a successful Supabase sign-in.
export async function trackLogin(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const ua     = req.headers["user-agent"] ?? "";
  // x-forwarded-for may be a comma-separated list; take the first (client) IP
  const rawIp  = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";

  const { browser, os, deviceType } = parseUA(ua);
  const deviceHash = deviceFingerprint(ua, os, browser, rawIp);

  // Upsert device — update last_seen on conflict
  const { data: existing } = await supabaseAdmin
    .from("user_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("device_hash", deviceHash)
    .maybeSingle();

  const isNewDevice = !existing;

  let deviceId: string | null = null;
  if (existing) {
    await supabaseAdmin
      .from("user_devices")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", existing.id);
    deviceId = existing.id;
  } else {
    const { data: inserted } = await supabaseAdmin
      .from("user_devices")
      .insert({ user_id: userId, device_hash: deviceHash, browser, os, device_type: deviceType })
      .select("id")
      .single();
    deviceId = inserted?.id ?? null;
  }

  const geo = await geoLookup(rawIp);

  const { data: histRow } = await supabaseAdmin
    .from("login_history")
    .insert({
      user_id:       userId,
      device_id:     deviceId,
      device_hash:   deviceHash,
      ip_address:    rawIp,
      country:       geo.country,
      city:          geo.city,
      browser,
      os,
      device_type:   deviceType,
      is_new_device: isNewDevice,
    })
    .select("id, created_at")
    .single();

  // Push realtime event to every open session for this user
  emitToUser(userId, "login:new", {
    id:           histRow?.id ?? "",
    browser,
    os,
    deviceType,
    deviceHash,
    country:      geo.country,
    city:         geo.city,
    ipAddress:    rawIp,
    createdAt:    histRow?.created_at ?? new Date().toISOString(),
    isNewDevice,
  });

  res.json({ success: true, data: null });
}

// ── GET /api/login-history/devices ────────────────────────────────────────────
export async function getDevices(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const { data, error } = await supabaseAdmin
    .from("user_devices")
    .select("id, device_hash, browser, os, device_type, first_seen, last_seen")
    .eq("user_id", userId)
    .order("last_seen", { ascending: false });

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: data ?? [] });
}

// ── GET /api/login-history/history ────────────────────────────────────────────
export async function getLoginHistory(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user.id;
  const limit  = Math.min(Number(req.query.limit ?? 50), 50);
  const offset = Number(req.query.offset ?? 0);

  const { data, error } = await supabaseAdmin
    .from("login_history")
    .select("id, device_hash, browser, os, device_type, ip_address, country, city, is_new_device, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data: data ?? [] });
}

// ── POST /api/login-history/sign-out-others ───────────────────────────────────
// Invalidates all other Supabase sessions then pushes force:logout via Socket.IO
// so other open tabs/devices sign out immediately without waiting for token expiry.
export async function signOutOthers(req: AuthRequest, res: Response): Promise<void> {
  const userId   = req.user.id;
  const socketId: string = (req.body as any)?.socketId ?? "";

  // Revoke all other Supabase sessions for this user (keeps current token valid)
  await supabaseAdmin.auth.admin.signOut(userId, "others");

  // Push real-time logout to every other open socket for this user
  emitToUserExcept(userId, socketId, "force:logout", undefined);

  res.json({ success: true, data: null });
}
