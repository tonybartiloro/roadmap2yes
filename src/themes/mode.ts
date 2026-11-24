import { MODE_STORAGE_KEY } from "./approved";
import type { ThemeMode } from "./types";

export type ModePreference = "system" | "light" | "dark";

export function isModePreference(value: unknown): value is ModePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveMode(preference: ModePreference, prefersDark: boolean): ThemeMode {
  if (preference === "light" || preference === "dark") return preference;
  return prefersDark ? "dark" : "light";
}

/**
 * Inline script run before the first paint (no flash): reads the per-device preference, falls
 * back to `prefers-color-scheme`, sets `data-mode` and aligns `<meta name="theme-color">` with
 * the active theme's `background`. Static string: no user data is ever interpolated.
 */
export const MODE_SCRIPT = `(function(){try{var d=document.documentElement;var m=localStorage.getItem(${JSON.stringify(MODE_STORAGE_KEY)});if(m!=="light"&&m!=="dark"){m=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.setAttribute("data-mode",m);var c=getComputedStyle(d).getPropertyValue("--background").trim();var t=document.querySelector('meta[name="theme-color"]');if(t&&c){t.setAttribute("content",c)}}catch(e){}})();`;
