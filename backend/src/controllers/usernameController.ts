import { Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { AuthRequest } from "../lib/types";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** GET /api/username/check?username=xyz
 *  Returns { available: true } or { available: false }
 *  No auth required so the setup screen can call it before the user finishes onboarding.
 */
export async function checkUsername(req: any, res: Response): Promise<void> {
  const raw = (req.query.username as string ?? "").toLowerCase().trim();

  if (!USERNAME_RE.test(raw)) {
    res.json({ success: true, data: { available: false, reason: "invalid" } });
    return;
  }

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", raw)
    .maybeSingle();

  res.json({ success: true, data: { available: !data } });
}

/** POST /api/username/set — set or change the current user's username (authenticated).
 *  Body: { username: string }
 */
export async function setUsername(req: AuthRequest, res: Response): Promise<void> {
  const raw = ((req.body as any).username ?? "").toLowerCase().trim();

  if (!USERNAME_RE.test(raw)) {
    res.status(400).json({ success: false, error: "Invalid username. Use 3–20 lowercase letters, numbers, or underscores." });
    return;
  }

  // Check uniqueness (exclude current user so they can re-confirm the same name)
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", raw)
    .neq("id", req.user.id)
    .maybeSingle();

  if (existing) {
    res.status(409).json({ success: false, error: "Username already taken." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ username: raw, updated_at: new Date().toISOString() })
    .eq("id", req.user.id)
    .select("id, username")
    .single();

  if (error) { res.status(500).json({ success: false, error: error.message }); return; }
  res.json({ success: true, data });
}
