// Profanity filter — checks group names and other user-facing text fields.
// Uses a normalized match so leet-speak substitutions (a→@, i→1, e→3, etc.)
// and extra spaces/punctuation don't bypass the filter.

const BAD_WORDS = [
  // English profanity
  "fuck", "fucker", "fucking", "fucks", "fucked", "fuckup",
  "shit", "shits", "shitting", "shitty", "bullshit",
  "ass", "asshole", "assholes", "asses", "jackass", "dumbass", "smartass",
  "bitch", "bitches", "bitching",
  "bastard", "bastards",
  "damn", "damned",
  "cunt", "cunts",
  "dick", "dicks", "dickhead",
  "cock", "cocks", "cockhead",
  "pussy", "pussies",
  "prick", "pricks",
  "whore", "whores",
  "slut", "sluts",
  "nigger", "nigga", "niggas", "niggers",
  "faggot", "faggots", "fag", "fags",
  "retard", "retarded", "retards",
  "idiot", "idiots",
  "moron", "morons",
  "imbecile",
  "crap", "crappy",
  "wanker", "wankers",
  "twat", "twats",
  "arsehole", "arse",
  "bollock", "bollocks",
  "motherfucker", "motherfuckers", "mf",
  "wtf", "stfu",
  "rape", "rapist",
  "pedophile", "pedo", "paedo",
  "nazi", "nazis",
  "terrorist", "terrorists",
  "pornhub", "porn",
  "xxx",
  "sex", "sexo",
  "penis", "vagina", "vulva",
  "boobs", "boob", "tits", "tit",
  "cum", "cumshot",
  "jizz",
  "spank",
  "dildo", "vibrator",
  "horny",
  "nude", "nudes",
  "onlyfans",
  "boner",
  "blowjob", "handjob",
  "anal",
  "orgy",
  "incest",
  "bestiality",
  "masturbate", "masturbation",
  "erection",
  "ejaculate", "ejaculation",
  "prostitute", "prostitution",
  "stripper",
  "escort",
];

// Normalize: lowercase, remove spaces/punctuation, replace common leet substitutions
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, ""); // strip all non-alpha
}

export function containsProfanity(text: string): boolean {
  const normalized = normalize(text);
  return BAD_WORDS.some(word => normalized.includes(normalize(word)));
}

export function getProfanityError(text: string): string | null {
  return containsProfanity(text)
    ? "Community name contains inappropriate language. Please choose a different name."
    : null;
}
