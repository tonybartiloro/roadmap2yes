import { THEMES } from "./catalog";
import type { Theme } from "./types";

/** Gate B (2026-11-24): all 12 themes are approved; the default is "Giardino". */
export const APPROVED_THEME_IDS = THEMES.map((theme) => theme.id) as readonly string[];
export const DEFAULT_THEME_ID = "giardino";

/** Name of the cookie that mirrors the wedding theme (id only, no personal data). */
export const THEME_COOKIE = "r2y-theme";
/** Name of the per-device mode preference key in `localStorage` (`system` | `light` | `dark`). */
export const MODE_STORAGE_KEY = "r2y-mode";

export function isApprovedThemeId(value: unknown): value is string {
  return typeof value === "string" && APPROVED_THEME_IDS.includes(value);
}

export function getTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? themeOrDefault(DEFAULT_THEME_ID);
}

function themeOrDefault(id: string): Theme {
  const found = THEMES.find((theme) => theme.id === id);
  if (!found) throw new Error(`Theme catalogue is missing the default theme "${id}"`);
  return found;
}

/**
 * Fallback chain (DES-16): the wedding's theme from the DB, else the `r2y-theme` cookie, else
 * "giardino". An id that is no longer approved falls through to the next source.
 */
export function resolveThemeId(
  fromDb: string | null | undefined,
  fromCookie: string | null | undefined,
): string {
  if (isApprovedThemeId(fromDb)) return fromDb;
  if (isApprovedThemeId(fromCookie)) return fromCookie;
  return DEFAULT_THEME_ID;
}
