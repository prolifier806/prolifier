export interface AutoDownloadPrefs {
  wifi: boolean;
  mobile: boolean;
}

const PREFS_KEY = "prolifier_auto_dl";
export const PREFS_EVENT = "prolifier:autodl";

export function getAutoDownloadPrefs(): AutoDownloadPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as AutoDownloadPrefs;
  } catch {}
  return { wifi: true, mobile: false };
}

export function setAutoDownloadPrefs(prefs: AutoDownloadPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }));
}

/** Returns true if the current connection type matches user's auto-download prefs. */
export function shouldAutoDownload(): boolean {
  const prefs = getAutoDownloadPrefs();
  const conn = (navigator as any).connection as
    | { type?: string; effectiveType?: string }
    | undefined;

  if (!conn) return prefs.wifi; // assume Wi-Fi when API unavailable

  const isMobile =
    conn.type === "cellular" ||
    conn.effectiveType === "2g" ||
    conn.effectiveType === "3g";

  return isMobile ? prefs.mobile : prefs.wifi;
}
