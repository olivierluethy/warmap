// User-configurable app settings (issue #5.7). Persisted per-browser in
// localStorage so preferences survive reloads.

export interface AppSettings {
  notifications: boolean; // browser push notifications for new incidents
  sound: boolean; // synthesized alert chime on new incidents
  soundMinSeverity: number; // only chime at/above this severity
  reporter: boolean; // spoken "live reporter" announcements (TTS)
}

export const DEFAULT_SETTINGS: AppSettings = {
  notifications: false,
  sound: false,
  soundMinSeverity: 5,
  reporter: false,
};

const KEY = "warmap.settings.v1";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage may be unavailable (private mode / disabled) — ignore
  }
}
