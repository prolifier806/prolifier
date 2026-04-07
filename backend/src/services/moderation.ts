/**
 * Server-side content moderation — authoritative gate.
 * The frontend pre-filter in security/moderation.ts is for UX only.
 * This runs on every content submission regardless of frontend state.
 *
 * Severity levels:
 *  - "block"  — content rejected, request returns 422
 *  - "flag"   — content allowed but recorded in moderation_flags for admin review
 */
import { supabaseAdmin } from "../lib/supabase";

export type ModerationSeverity = "block" | "flag";

interface BlockedEntry {
  pattern: RegExp;
  severity: ModerationSeverity;
  category: string;
}

// Build once at startup
const BLOCKED: BlockedEntry[] = [
  // Racial slurs
  ...["n[i1]gg[ae3]r", "ch[i1]nk", "sp[i1]c", "w[e3]tb[a4]ck", "k[i1]k[e3]", "g[o0]{2}k", "cr[a4]ck[e3]r"].map(
    (p) => ({ pattern: new RegExp(`\\b${p}\\b`, "i"), severity: "block" as const, category: "slur" })
  ),
  // Homophobic / transphobic
  ...["f[a4]gg?[o0]t", "tr[a4]nn[yi1]e?", "d[yi1]k[e3]"].map(
    (p) => ({ pattern: new RegExp(`\\b${p}\\b`, "i"), severity: "block" as const, category: "slur" })
  ),
  // Threats / self-harm
  ...[
    "kill\\s+yourself",
    "kys",
    "i\\s+will\\s+kill\\s+you",
    "i\\s+will\\s+hurt\\s+you",
    "i\\s+know\\s+where\\s+you\\s+live",
    "you\\s+should\\s+die",
    "hope\\s+you\\s+die",
    "go\\s+die",
    "end\\s+your\\s+life",
    "slit\\s+your\\s+wrists",
  ].map((p) => ({ pattern: new RegExp(`\\b${p}\\b`, "i"), severity: "block" as const, category: "threat" })),
  // Violence
  ...["bomb\\s+threat", "shoot\\s+up", "mass\\s+shooting", "school\\s+shooting"].map(
    (p) => ({ pattern: new RegExp(`\\b${p}\\b`, "i"), severity: "block" as const, category: "threat" })
  ),
  // Doxxing
  { pattern: /\bdox(?:x)?(?:ing)?\b/i, severity: "block", category: "harassment" },
  // Heavy profanity (flag, not block)
  ...["fuck", "shit", "asshole", "bitch", "cunt", "bastard"].map(
    (p) => ({ pattern: new RegExp(`\\b${p}\\b`, "i"), severity: "flag" as const, category: "profanity" })
  ),
];

export interface ModerationResult {
  allowed: boolean;
  severity?: ModerationSeverity;
  category?: string;
  matched?: string;
}

export function checkContent(text: string): ModerationResult {
  if (!text) return { allowed: true };

  for (const entry of BLOCKED) {
    const match = text.match(entry.pattern);
    if (match) {
      if (entry.severity === "block") {
        return { allowed: false, severity: "block", category: entry.category, matched: match[0] };
      }
      // "flag" — allowed but flagged for review
      return { allowed: true, severity: "flag", category: entry.category, matched: match[0] };
    }
  }

  return { allowed: true };
}

/** Validate multiple text fields at once. Returns first blocking or flagging result. */
export function checkFields(fields: Record<string, string>): ModerationResult {
  let flagResult: ModerationResult | null = null;
  for (const [, value] of Object.entries(fields)) {
    const result = checkContent(value);
    if (!result.allowed) return result; // block immediately
    if (result.severity === "flag" && !flagResult) flagResult = result; // keep first flag
  }
  return flagResult ?? { allowed: true };
}

/**
 * Records flagged content to the moderation_flags table for admin review.
 * Call this when checkContent/checkFields returns { allowed: true, severity: "flag" }.
 * Fire-and-forget — don't await in hot path; failure is non-fatal.
 *
 * WHY: Previously "flag" severity was computed but never persisted anywhere.
 * Admins had no visibility into borderline content without proactive DB queries.
 */
export function recordModerationFlag(opts: {
  userId: string;
  contentType: "post" | "comment" | "message" | "profile" | "collab" | "group_message";
  contentId?: string;
  text: string;
  category: string;
  matched?: string;
}): void {
  supabaseAdmin.from("moderation_flags").insert({
    user_id: opts.userId,
    content_type: opts.contentType,
    content_id: opts.contentId ?? null,
    flagged_text: opts.text.slice(0, 500), // cap stored text at 500 chars
    category: opts.category,
    matched_pattern: opts.matched ?? null,
  }).then(({ error }) => {
    if (error) console.warn("[moderation] Failed to record flag:", error.message);
  });
}
