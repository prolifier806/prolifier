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
  | "sexual"
  | "slur"
  | "casteist"
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
  { word: "kill yourself",      severity: "block", category: "threat" },
  { word: "go kill yourself",   severity: "block", category: "threat" },
  { word: "kys",                severity: "block", category: "threat" },
  { word: "i will kill you",    severity: "block", category: "threat" },
  { word: "i will kill",        severity: "block", category: "threat" },
  { word: "i kill you",         severity: "block", category: "threat" },
  { word: "gonna kill you",     severity: "block", category: "threat" },
  { word: "going to kill you",  severity: "block", category: "threat" },
  { word: "imma kill you",      severity: "block", category: "threat" },
  { word: "ima kill you",       severity: "block", category: "threat" },
  { word: "kill u",             severity: "block", category: "threat" },
  { word: "i will hurt you",    severity: "block", category: "threat" },
  { word: "i will beat you",    severity: "block", category: "threat" },
  { word: "i will destroy you", severity: "block", category: "threat" },
  { word: "i want you dead",    severity: "block", category: "threat" },
  { word: "you should die",     severity: "block", category: "threat" },
  { word: "hope you die",       severity: "block", category: "threat" },
  { word: "go die",             severity: "block", category: "threat" },
  { word: "drop dead",          severity: "block", category: "threat" },
  { word: "slit your wrists",   severity: "block", category: "threat" },
  { word: "hang yourself",      severity: "block", category: "threat" },
  { word: "shoot yourself",     severity: "block", category: "threat" },
  { word: "stab you",           severity: "block", category: "threat" },
  { word: "i will stab",        severity: "block", category: "threat" },
  { word: "i will find you",    severity: "block", category: "threat" },
  { word: "i know where you",   severity: "block", category: "threat" },
  // ── BLOCK: Doxxing ────────────────────────────────────────────────────────
  { word: "i will dox",       severity: "block", category: "harassment" },
  { word: "doxx you",         severity: "block", category: "harassment" },
  // ── BLOCK: Profanity ─────────────────────────────────────────────────────
  { word: "fuck",             severity: "block", category: "profanity" },
  { word: "fucking",          severity: "block", category: "profanity" },
  { word: "fucked",           severity: "block", category: "profanity" },
  { word: "fucker",           severity: "block", category: "profanity" },
  { word: "fck",              severity: "block", category: "profanity" },
  { word: "fuk",              severity: "block", category: "profanity" },
  { word: "f*ck",             severity: "block", category: "profanity" },
  { word: "shit",             severity: "block", category: "profanity" },
  { word: "shitting",         severity: "block", category: "profanity" },
  { word: "sh*t",             severity: "block", category: "profanity" },
  { word: "asshole",          severity: "block", category: "profanity" },
  { word: "bitch",            severity: "block", category: "profanity" },
  { word: "b*tch",            severity: "block", category: "profanity" },
  { word: "cunt",             severity: "block", category: "profanity" },
  { word: "bastard",          severity: "block", category: "profanity" },
  { word: "motherfucker",     severity: "block", category: "profanity" },
  { word: "mf",               severity: "block", category: "profanity" },
  { word: "bullshit",         severity: "block", category: "profanity" },
  { word: "horseshit",        severity: "block", category: "profanity" },
  { word: "jackass",          severity: "block", category: "profanity" },
  { word: "dumbass",          severity: "block", category: "profanity" },
  { word: "ass",              severity: "block", category: "profanity" },
  { word: "damn",             severity: "block", category: "profanity" },
  { word: "hell",             severity: "block", category: "profanity" },
  { word: "piss",             severity: "block", category: "profanity" },
  { word: "pissed",           severity: "block", category: "profanity" },
  { word: "cock",             severity: "block", category: "profanity" },
  { word: "dick",             severity: "block", category: "profanity" },
  { word: "pussy",            severity: "block", category: "profanity" },
  { word: "whore",            severity: "block", category: "profanity" },
  { word: "slut",             severity: "block", category: "profanity" },
  { word: "wtf",              severity: "block", category: "profanity" },
  { word: "stfu",             severity: "block", category: "profanity" },
  // ── BLOCK: Ableist / demeaning ───────────────────────────────────────────
  { word: "retard",           severity: "block", category: "harassment" },
  { word: "retarded",         severity: "block", category: "harassment" },
  { word: "moron",            severity: "block", category: "harassment" },
  { word: "imbecile",         severity: "block", category: "harassment" },
  // ── BLOCK: Body-shaming ──────────────────────────────────────────────────
  { word: "fat pig",          severity: "block", category: "harassment" },
  { word: "ugly bitch",       severity: "block", category: "harassment" },

  // ── BLOCK: Hindi / Urdu ───────────────────────────────────────────────────
  { word: "bhenchod",         severity: "block", category: "sexual" },
  { word: "bhen chod",        severity: "block", category: "sexual" },
  { word: "bhnchd",           severity: "block", category: "sexual" },
  { word: "bc",               severity: "flag",  category: "sexual" },
  { word: "madarchod",        severity: "block", category: "sexual" },
  { word: "madar chod",       severity: "block", category: "sexual" },
  { word: "madarchut",        severity: "block", category: "sexual" },
  { word: "mc",               severity: "flag",  category: "sexual" },
  { word: "bmkb",             severity: "flag",  category: "sexual" },
  { word: "chutiya",          severity: "block", category: "sexual" },
  { word: "chut",             severity: "block", category: "sexual" },
  { word: "choot",            severity: "block", category: "sexual" },
  { word: "bhosdike",         severity: "block", category: "sexual" },
  { word: "bhosdiwale",       severity: "block", category: "sexual" },
  { word: "bhosdika",         severity: "block", category: "sexual" },
  { word: "lund",             severity: "block", category: "sexual" },
  { word: "loda",             severity: "block", category: "sexual" },
  { word: "lauda",            severity: "block", category: "sexual" },
  { word: "lodu",             severity: "block", category: "sexual" },
  { word: "gaand",            severity: "block", category: "sexual" },
  { word: "gand",             severity: "block", category: "sexual" },
  { word: "gaandu",           severity: "block", category: "sexual" },
  { word: "gandu",            severity: "block", category: "sexual" },
  { word: "randi",            severity: "block", category: "sexual" },
  { word: "rande",            severity: "block", category: "sexual" },
  { word: "randwa",           severity: "block", category: "sexual" },
  { word: "bitch teri maa",   severity: "block", category: "sexual" },
  { word: "teri maa ki",      severity: "block", category: "sexual" },
  { word: "teri maa",         severity: "flag",  category: "sexual" },
  { word: "teri behen",       severity: "flag",  category: "sexual" },
  { word: "tere baap",        severity: "flag",  category: "sexual" },
  { word: "haraami",          severity: "block", category: "harassment" },
  { word: "harami",           severity: "block", category: "harassment" },
  { word: "kutta",            severity: "block", category: "harassment" },
  { word: "kutte",            severity: "block", category: "harassment" },
  { word: "kamina",           severity: "block", category: "harassment" },
  { word: "kamine",           severity: "block", category: "harassment" },
  { word: "saala",            severity: "block", category: "harassment" },
  { word: "sali",             severity: "block", category: "harassment" },
  { word: "ullu",             severity: "block", category: "harassment" },
  { word: "ullu ka pattha",   severity: "block", category: "harassment" },
  { word: "nikamma",          severity: "block", category: "harassment" },
  { word: "napunsak",         severity: "block", category: "harassment" },
  { word: "hijra",            severity: "block", category: "slur" },
  { word: "hijda",            severity: "block", category: "slur" },
  { word: "chakka",           severity: "block", category: "slur" },
  { word: "behenke lode",     severity: "block", category: "sexual" },
  { word: "bklol",            severity: "flag",  category: "harassment" },
  { word: "mkbc",             severity: "flag",  category: "sexual" },
  { word: "lmao teri maa",    severity: "block", category: "sexual" },
  // Casteist
  { word: "chamar",           severity: "block", category: "casteist" },
  { word: "chamaar",          severity: "block", category: "casteist" },
  { word: "bhangi",           severity: "block", category: "casteist" },
  { word: "maang",            severity: "block", category: "casteist" },
  { word: "dhed",             severity: "block", category: "casteist" },
  { word: "dhor",             severity: "block", category: "casteist" },
  { word: "neech jaat",       severity: "block", category: "casteist" },
  { word: "neech",            severity: "flag",  category: "casteist" },
  // Religious slurs
  { word: "katua",            severity: "block", category: "slur" },
  { word: "katwa",            severity: "block", category: "slur" },
  { word: "kafir",            severity: "flag",  category: "slur" },
  { word: "mullah",           severity: "flag",  category: "slur" },
  { word: "jihadi",           severity: "flag",  category: "slur" },
  { word: "terrorist mullah", severity: "block", category: "slur" },

  // ── BLOCK: Punjabi ────────────────────────────────────────────────────────
  { word: "penchod",          severity: "block", category: "sexual" },
  { word: "pen chod",         severity: "block", category: "sexual" },
  { word: "mothchod",         severity: "block", category: "sexual" },
  { word: "mada chod",        severity: "block", category: "sexual" },
  { word: "dallay",           severity: "block", category: "sexual" },
  { word: "dalla",            severity: "block", category: "sexual" },
  { word: "gashti",           severity: "block", category: "sexual" },
  { word: "lun",              severity: "block", category: "sexual" },
  { word: "tatti",            severity: "flag",  category: "harassment" },
  { word: "khota",            severity: "flag",  category: "harassment" },

  // ── BLOCK: Tamil ─────────────────────────────────────────────────────────
  { word: "punda",            severity: "block", category: "sexual" },
  { word: "pundamavane",      severity: "block", category: "sexual" },
  { word: "pundachi",         severity: "block", category: "sexual" },
  { word: "oombu",            severity: "block", category: "sexual" },
  { word: "thevdiya",         severity: "block", category: "sexual" },
  { word: "thevdiyapaya",     severity: "block", category: "sexual" },
  { word: "sunni",            severity: "block", category: "sexual" },
  { word: "koothi",           severity: "block", category: "sexual" },
  { word: "soothu",           severity: "block", category: "sexual" },
  { word: "otha",             severity: "block", category: "sexual" },
  { word: "ottiya",           severity: "block", category: "sexual" },
  { word: "loosu",            severity: "flag",  category: "harassment" },
  { word: "baadu",            severity: "flag",  category: "harassment" },
  { word: "naye",             severity: "flag",  category: "harassment" },
  { word: "naaye",            severity: "flag",  category: "harassment" },
  { word: "parayan",          severity: "block", category: "casteist" },
  { word: "pallan",           severity: "block", category: "casteist" },
  { word: "sakkiliyar",       severity: "block", category: "casteist" },

  // ── BLOCK: Telugu ─────────────────────────────────────────────────────────
  { word: "dengey",           severity: "block", category: "sexual" },
  { word: "dengu",            severity: "block", category: "sexual" },
  { word: "dengina",          severity: "block", category: "sexual" },
  { word: "puku",             severity: "block", category: "sexual" },
  { word: "modda",            severity: "block", category: "sexual" },
  { word: "lanjha",           severity: "block", category: "sexual" },
  { word: "lanja",            severity: "block", category: "sexual" },
  { word: "lanjakodaka",      severity: "block", category: "sexual" },
  { word: "naakodaka",        severity: "block", category: "sexual" },
  { word: "gudda",            severity: "flag",  category: "sexual" },
  { word: "donga",            severity: "flag",  category: "harassment" },

  // ── BLOCK: Bengali ────────────────────────────────────────────────────────
  { word: "bokachoda",        severity: "block", category: "sexual" },
  { word: "boka choda",       severity: "block", category: "sexual" },
  { word: "banchod",          severity: "block", category: "sexual" },
  { word: "khanki",           severity: "block", category: "sexual" },
  { word: "khanki magi",      severity: "block", category: "sexual" },
  { word: "magi",             severity: "block", category: "sexual" },
  { word: "khankir chele",    severity: "block", category: "sexual" },
  { word: "chudi",            severity: "block", category: "sexual" },
  { word: "chude",            severity: "block", category: "sexual" },
  { word: "tor maa",          severity: "block", category: "sexual" },
  { word: "toder maa",        severity: "block", category: "sexual" },
  { word: "haramzada",        severity: "block", category: "harassment" },
  { word: "haramjada",        severity: "block", category: "harassment" },
  { word: "shala",            severity: "flag",  category: "harassment" },
  { word: "shali",            severity: "flag",  category: "harassment" },
  { word: "chhagal",          severity: "flag",  category: "harassment" },
  { word: "kukur",            severity: "flag",  category: "harassment" },

  // ── BLOCK: Kannada ────────────────────────────────────────────────────────
  { word: "tike",             severity: "block", category: "sexual" },
  { word: "thike",            severity: "block", category: "sexual" },
  { word: "hende",            severity: "block", category: "sexual" },
  { word: "sule",             severity: "block", category: "sexual" },
  { word: "sulemaganey",      severity: "block", category: "sexual" },
  { word: "boli",             severity: "block", category: "sexual" },
  { word: "bolimaga",         severity: "block", category: "sexual" },
  { word: "nin amma",         severity: "block", category: "sexual" },
  { word: "nin akka",         severity: "block", category: "sexual" },
  { word: "bekku",            severity: "flag",  category: "harassment" },
  { word: "muchkond hogi",    severity: "flag",  category: "harassment" },
  { word: "holeya",           severity: "block", category: "casteist" },

  // ── BLOCK: Arabic (Roman transliteration) ────────────────────────────────
  { word: "kos omak",         severity: "block", category: "sexual" },
  { word: "kos ommak",        severity: "block", category: "sexual" },
  { word: "kos okhtak",       severity: "block", category: "sexual" },
  { word: "kos okhto",        severity: "block", category: "sexual" },
  { word: "kuss",             severity: "block", category: "sexual" },
  { word: "kus",              severity: "block", category: "sexual" },
  { word: "ayr",              severity: "block", category: "sexual" },
  { word: "zibbi",            severity: "block", category: "sexual" },
  { word: "zebbi",            severity: "block", category: "sexual" },
  { word: "sharmouta",        severity: "block", category: "sexual" },
  { word: "sharmuta",         severity: "block", category: "sexual" },
  { word: "ibn el sharmouta", severity: "block", category: "sexual" },
  { word: "ibn sharmouta",    severity: "block", category: "sexual" },
  { word: "bint el sharmouta",severity: "block", category: "sexual" },
  { word: "ahba",             severity: "block", category: "sexual" },
  { word: "qahba",            severity: "block", category: "sexual" },
  { word: "kahba",            severity: "block", category: "sexual" },
  { word: "kahbe",            severity: "block", category: "sexual" },
  { word: "metnak",           severity: "block", category: "sexual" },
  { word: "metnakk",          severity: "block", category: "sexual" },
  { word: "nayek",            severity: "block", category: "sexual" },
  { word: "ayir fi",          severity: "block", category: "sexual" },
  { word: "da ayrr",          severity: "block", category: "sexual" },
  { word: "ibn el kalb",      severity: "block", category: "harassment" },
  { word: "ibn kelb",         severity: "block", category: "harassment" },
  { word: "ibn el himar",     severity: "block", category: "harassment" },
  { word: "khara alek",       severity: "block", category: "harassment" },
  { word: "ya khara",         severity: "block", category: "harassment" },
  { word: "weld el haram",    severity: "block", category: "harassment" },
  { word: "walad haram",      severity: "block", category: "harassment" },
  { word: "ibn haram",        severity: "block", category: "harassment" },
  { word: "yelan abu",        severity: "block", category: "harassment" },
  { word: "teez",             severity: "flag",  category: "sexual" },
  { word: "tizz",             severity: "flag",  category: "sexual" },
  { word: "kalb",             severity: "flag",  category: "harassment" },
  { word: "kelb",             severity: "flag",  category: "harassment" },
  { word: "himaar",           severity: "flag",  category: "harassment" },
  { word: "himar",            severity: "flag",  category: "harassment" },
  { word: "khara",            severity: "flag",  category: "harassment" },
  { word: "gazma",            severity: "flag",  category: "harassment" },
  { word: "yel an",           severity: "flag",  category: "harassment" },

  // ── BLOCK: Turkish ────────────────────────────────────────────────────────
  { word: "siktir",           severity: "block", category: "sexual" },
  { word: "orospu",           severity: "block", category: "sexual" },
  { word: "orospu cocugu",    severity: "block", category: "sexual" },
  { word: "orospunun dogurdugu", severity: "block", category: "sexual" },
  { word: "amina koyayim",    severity: "block", category: "sexual" },
  { word: "amina koy",        severity: "block", category: "sexual" },
  { word: "sikeyim",          severity: "block", category: "sexual" },
  { word: "gotten sikeyim",   severity: "block", category: "sexual" },
  { word: "dalyarak",         severity: "block", category: "sexual" },
  { word: "yarak",            severity: "block", category: "sexual" },
  { word: "yarrak",           severity: "block", category: "sexual" },
  { word: "ibne",             severity: "block", category: "slur" },
  { word: "ibni",             severity: "block", category: "slur" },
  { word: "pust",             severity: "block", category: "slur" },
  { word: "senin ananı",      severity: "block", category: "sexual" },
  { word: "anasini",          severity: "block", category: "sexual" },
  { word: "koyayim",          severity: "block", category: "sexual" },
  { word: "kahpe",            severity: "block", category: "sexual" },
  { word: "pezevenk",         severity: "block", category: "sexual" },
  { word: "got oglani",       severity: "block", category: "slur" },
  { word: "pic",              severity: "block", category: "harassment" },
  { word: "amk",              severity: "flag",  category: "sexual" },
  { word: "bok",              severity: "flag",  category: "harassment" },
  { word: "boktan",           severity: "flag",  category: "harassment" },
  { word: "amina",            severity: "flag",  category: "sexual" },
  { word: "anan",             severity: "flag",  category: "sexual" },
  { word: "anani",            severity: "flag",  category: "sexual" },
  { word: "essek",            severity: "flag",  category: "harassment" },
  { word: "aptal",            severity: "flag",  category: "harassment" },
  { word: "salak",            severity: "flag",  category: "harassment" },
  { word: "geri zekalı",      severity: "flag",  category: "harassment" },

  // ── BLOCK: Indonesian / Malay ─────────────────────────────────────────────
  { word: "kontol",           severity: "block", category: "sexual" },
  { word: "kontool",          severity: "block", category: "sexual" },
  { word: "memek",            severity: "block", category: "sexual" },
  { word: "meki",             severity: "block", category: "sexual" },
  { word: "ngentot",          severity: "block", category: "sexual" },
  { word: "entot",            severity: "block", category: "sexual" },
  { word: "ngewe",            severity: "block", category: "sexual" },
  { word: "ngewek",           severity: "block", category: "sexual" },
  { word: "jembut",           severity: "block", category: "sexual" },
  { word: "pepek",            severity: "block", category: "sexual" },
  { word: "titit",            severity: "block", category: "sexual" },
  { word: "colmek",           severity: "block", category: "sexual" },
  { word: "bangsat",          severity: "block", category: "harassment" },
  { word: "bajingan",         severity: "block", category: "harassment" },
  { word: "keparat",          severity: "block", category: "harassment" },
  { word: "kurang ajar",      severity: "block", category: "harassment" },
  { word: "jancok",           severity: "block", category: "sexual" },
  { word: "jancuk",           severity: "block", category: "sexual" },
  { word: "asu kowe",         severity: "block", category: "harassment" },
  { word: "cuki mai",         severity: "block", category: "sexual" },
  { word: "cukimak",          severity: "block", category: "sexual" },
  { word: "pukimak",          severity: "block", category: "sexual" },
  { word: "brengsek lu",      severity: "block", category: "harassment" },
  { word: "coli",             severity: "flag",  category: "sexual" },
  { word: "anjing",           severity: "flag",  category: "harassment" },
  { word: "anjir",            severity: "flag",  category: "harassment" },
  { word: "asu",              severity: "flag",  category: "harassment" },
  { word: "babi",             severity: "flag",  category: "harassment" },
  { word: "brengsek",         severity: "flag",  category: "harassment" },
  { word: "tai",              severity: "flag",  category: "harassment" },
  { word: "tolol",            severity: "flag",  category: "harassment" },
  { word: "goblok",           severity: "flag",  category: "harassment" },
  { word: "sial",             severity: "flag",  category: "harassment" },
  { word: "kampret",          severity: "flag",  category: "harassment" },
  { word: "matamu",           severity: "flag",  category: "harassment" },
  { word: "matane",           severity: "flag",  category: "harassment" },
  { word: "mampus",           severity: "flag",  category: "harassment" },
];

// ── Pattern compiler ──────────────────────────────────────────────────────────
// Uses lookahead/lookbehind instead of \b so it works correctly with:
//   - Non-ASCII characters (Turkish ı, Arabic transliterations, etc.)
//   - Punctuation and emoji immediately adjacent to the word
//   - Multi-word phrases with flexible whitespace
//
// "ass"           → won't match "grass" (preceded by alpha 'r')
// "bhenchod"      → matches "bhenchod!", "...bhenchod..." etc.
// "kill yourself" → matches "kill  yourself" (flexible whitespace)
function makePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/ +/g, "\\s+");
  return new RegExp(`(?<![a-zA-Z])${flexible}(?![a-zA-Z])`, "gi");
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
