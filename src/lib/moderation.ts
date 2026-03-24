// ─────────────────────────────────────────────────────────────────────────────
// Client-side content moderation pre-filter
//
// Mirrors the blocked_words DB table for instant UX feedback before the
// Supabase trigger fires.  The DB trigger is the authoritative gate — this
// file only provides early, synchronous feedback to the user.
//
// Word-boundary rules (identical to the SQL \m...\M logic):
//   \b  in JS regex matches between \w ([A-Za-z0-9_]) and \W.
//   "grass" does NOT trigger "ass"  (\b before 'a' is inside a word).
//   Multi-word phrases ("kill yourself") are split on whitespace → \s+
//   so spacing variations ("kill  yourself") still match.
// ─────────────────────────────────────────────────────────────────────────────

export type ModerationSeverity = "block" | "flag";
export type ModerationCategory =
  | "hate_speech"
  | "threat"
  | "profanity"
  | "harassment"
  | "other";

export interface ModerationResult {
  /** true  → content may be submitted (clean or only flagged)
   *  false → content must be rejected on the client before hitting the DB */
  allowed: boolean;
  severity?: ModerationSeverity;
  category?: ModerationCategory;
  matchedWord?: string;
  /** Human-readable message to surface in a toast / inline error */
  message?: string;
}

// ── Internal word-list entry ──────────────────────────────────────────────────
interface WordEntry {
  word: string;
  severity: ModerationSeverity;
  category: ModerationCategory;
}

// ── Blocked-words list (keep in sync with DB seed in 002_moderation.sql) ─────
// Adding a word here AND to the SQL migration ensures it is caught both
// client-side (instant) and server-side (bypass-proof).
const BLOCKED_ENTRIES: WordEntry[] = [
  // ── BLOCK: Racial slurs ────────────────────────────────────────────────────
  { word: "nigger",        severity: "block", category: "hate_speech" },
  { word: "nigga",         severity: "block", category: "hate_speech" },
  { word: "chink",         severity: "block", category: "hate_speech" },
  { word: "gook",          severity: "block", category: "hate_speech" },
  { word: "spic",          severity: "block", category: "hate_speech" },
  { word: "wetback",       severity: "block", category: "hate_speech" },
  { word: "kike",          severity: "block", category: "hate_speech" },
  { word: "towelhead",     severity: "block", category: "hate_speech" },
  { word: "sandnigger",    severity: "block", category: "hate_speech" },
  { word: "coon",          severity: "block", category: "hate_speech" },
  { word: "jigaboo",       severity: "block", category: "hate_speech" },
  { word: "porch monkey",  severity: "block", category: "hate_speech" },
  { word: "jungle bunny",  severity: "block", category: "hate_speech" },
  // ── BLOCK: Homophobic / transphobic slurs ──────────────────────────────────
  { word: "faggot",        severity: "block", category: "hate_speech" },
  { word: "fag",           severity: "block", category: "hate_speech" },
  { word: "dyke",          severity: "block", category: "hate_speech" },
  { word: "tranny",        severity: "block", category: "hate_speech" },
  { word: "shemale",       severity: "block", category: "hate_speech" },
  // ── BLOCK: Violent threats & self-harm encouragement ──────────────────────
  { word: "kill yourself",    severity: "block", category: "threat" },
  { word: "go kill yourself", severity: "block", category: "threat" },
  { word: "kys",              severity: "block", category: "threat" },
  { word: "i will kill you",  severity: "block", category: "threat" },
  { word: "i will hurt you",  severity: "block", category: "threat" },
  { word: "i want you dead",  severity: "block", category: "threat" },
  { word: "you should die",   severity: "block", category: "threat" },
  { word: "hope you die",     severity: "block", category: "threat" },
  { word: "go die",           severity: "block", category: "threat" },
  { word: "slit your wrists", severity: "block", category: "threat" },
  { word: "hang yourself",    severity: "block", category: "threat" },
  { word: "shoot yourself",   severity: "block", category: "threat" },
  { word: "stab you",         severity: "block", category: "threat" },
  { word: "i will find you",  severity: "block", category: "threat" },
  // ── BLOCK: Doxxing ────────────────────────────────────────────────────────
  { word: "i will dox",       severity: "block", category: "harassment" },
  { word: "doxx you",         severity: "block", category: "harassment" },
  // ── FLAG: Profanity ───────────────────────────────────────────────────────
  { word: "fuck",             severity: "flag", category: "profanity" },
  { word: "shit",             severity: "flag", category: "profanity" },
  { word: "asshole",          severity: "flag", category: "profanity" },
  { word: "bitch",            severity: "flag", category: "profanity" },
  { word: "cunt",             severity: "flag", category: "profanity" },
  { word: "bastard",          severity: "flag", category: "profanity" },
  { word: "motherfucker",     severity: "flag", category: "profanity" },
  { word: "bullshit",         severity: "flag", category: "profanity" },
  { word: "horseshit",        severity: "flag", category: "profanity" },
  { word: "jackass",          severity: "flag", category: "profanity" },
  { word: "dumbass",          severity: "flag", category: "profanity" },
  // ── FLAG: Ableist / demeaning ─────────────────────────────────────────────
  { word: "retard",           severity: "flag", category: "harassment" },
  { word: "retarded",         severity: "flag", category: "harassment" },
  { word: "moron",            severity: "flag", category: "harassment" },
  { word: "imbecile",         severity: "flag", category: "harassment" },
  // ── FLAG: Body-shaming phrases ────────────────────────────────────────────
  { word: "fat pig",          severity: "flag", category: "harassment" },
  { word: "ugly bitch",       severity: "flag", category: "harassment" },
];

// ── Pattern compiler ──────────────────────────────────────────────────────────
// Builds a word-boundary-aware RegExp from a plain word or phrase.
//
//   "ass"          → /\bass\b/gi        (won't match "grass" or "class")
//   "kill yourself" → /\bkill\s+yourself\b/gi  (phrase, flexible whitespace)
function makePattern(phrase: string): RegExp {
  // Escape all regex special characters in the stored phrase
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Replace literal spaces with \s+ so "kill  yourself" still matches
  const flexible = escaped.replace(/ +/g, "\\s+");
  return new RegExp(`\\b${flexible}\\b`, "gi");
}

// ── Pre-compile at module load — zero runtime cost per check ─────────────────
// Sort: block entries first so the first hit returns the most severe result.
const COMPILED = BLOCKED_ENTRIES
  .slice()
  .sort((a, b) => (a.severity === "block" ? -1 : b.severity === "block" ? 1 : 0))
  .map(entry => ({ ...entry, pattern: makePattern(entry.word) }));

// ── User-facing messages ──────────────────────────────────────────────────────
const BLOCK_MESSAGE =
  "Your message contains content that isn't allowed on Prolifier. Please revise it before posting.";

const FLAG_MESSAGE =
  "Your message may contain language that goes against our community guidelines. It will be reviewed.";

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Synchronously checks `text` against the local blocked-word list.
 *
 * @returns ModerationResult
 *   • allowed = true  → submit to DB (may still be flagged server-side)
 *   • allowed = false → block on the client, show result.message to the user
 *
 * Usage:
 *   const result = checkContent(postText);
 *   if (!result.allowed) { toast({ title: result.message }); return; }
 */
export function checkContent(text: string): ModerationResult {
  if (!text || !text.trim()) return { allowed: true };

  for (const entry of COMPILED) {
    // Reset lastIndex on global regexes between calls
    entry.pattern.lastIndex = 0;

    if (entry.pattern.test(text)) {
      return {
        allowed: entry.severity !== "block",
        severity: entry.severity,
        category: entry.category,
        matchedWord: entry.word,
        message: entry.severity === "block" ? BLOCK_MESSAGE : FLAG_MESSAGE,
      };
    }
  }

  return { allowed: true };
}

/**
 * Throws a plain Error with a user-friendly message if content is blocked.
 * Useful inside async submit handlers:
 *
 *   try {
 *     assertContentAllowed(text);
 *     await supabase.from("posts").insert({ content: text });
 *   } catch (e) {
 *     toast({ title: e.message, variant: "destructive" });
 *   }
 */
export function assertContentAllowed(text: string): void {
  const result = checkContent(text);
  if (!result.allowed) {
    throw new Error(result.message ?? BLOCK_MESSAGE);
  }
}

/**
 * Maps a Supabase PostgREST / DB error to a human-readable moderation message.
 * The DB trigger raises with hint = 'blocked'; this function detects that.
 *
 * Returns null if the error is unrelated to moderation.
 *
 * Usage:
 *   const { error } = await supabase.from("posts").insert(...);
 *   const modMsg = parseModerationError(error);
 *   if (modMsg) { toast({ title: modMsg, variant: "destructive" }); return; }
 */
export function parseModerationError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;

  const message = String(e.message ?? "");
  const hint    = String(e.hint    ?? "");
  const code    = String(e.code    ?? "");

  // DB trigger raises with hint='blocked' and errcode='P0001'
  if (
    hint    === "blocked" ||
    code    === "P0001"   ||
    message.toLowerCase().includes("content blocked")
  ) {
    return BLOCK_MESSAGE;
  }

  return null;
}

/**
 * Convenience: runs client check AND maps any DB error in one call.
 * Returns the first error message found, or null if everything is fine.
 *
 * Usage:
 *   // Before submit:
 *   const preMsg = moderationMessage({ text: postText });
 *   if (preMsg) { toast({ title: preMsg }); return; }
 *
 *   // After failed DB insert:
 *   const postMsg = moderationMessage({ dbError: error });
 *   if (postMsg) { toast({ title: postMsg }); return; }
 */
export function moderationMessage({
  text,
  dbError,
}: {
  text?: string;
  dbError?: unknown;
}): string | null {
  if (text) {
    const result = checkContent(text);
    if (!result.allowed) return result.message ?? BLOCK_MESSAGE;
  }
  if (dbError) {
    return parseModerationError(dbError);
  }
  return null;
}
