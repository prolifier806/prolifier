const revealedUrls = new Set<string>();

export interface MediaPrefs {
  autoDownloadWifi: boolean;
}

const PREFS_KEY = "prolifier_media_prefs";
export const PREFS_EVENT = "prolifier:mediaprefs";

export function getMediaPrefs(): MediaPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as MediaPrefs;
  } catch {}
  return { autoDownloadWifi: false };
}

export function setMediaPrefs(prefs: MediaPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }));
}

export function isRevealed(url: string): boolean {
  return revealedUrls.has(url);
}

export function markRevealed(url: string): void {
  revealedUrls.add(url);
}
