"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME_ID,
  MODE_STORAGE_KEY,
  THEME_COOKIE,
  getTheme,
  isApprovedThemeId,
} from "@/themes/approved";
import { fontVariableName } from "@/themes/font-names";
import { isModePreference, resolveMode, type ModePreference } from "@/themes/mode";
import type { ThemeMode } from "@/themes/types";

/** Longest we wait for a font before applying a provisional theme (design §5.4). */
export const FONT_WAIT_MS = 1500;

interface ThemeContextValue {
  /** Theme saved on the wedding (what both partners see). */
  savedThemeId: string;
  /** Theme currently applied to the interface (differs from saved while previewing). */
  activeThemeId: string;
  isPreviewing: boolean;
  modePreference: ModePreference;
  mode: ThemeMode;
  /** Applies a theme provisionally to the whole interface (waits for its fonts, max 1.5 s). */
  preview: (themeId: string) => Promise<void>;
  /** Drops the provisional theme and goes back to the saved one. */
  cancelPreview: () => void;
  /** Call after the server saved the theme: the preview becomes the saved theme + cookie. */
  confirmSaved: (themeId: string) => void;
  setModePreference: (preference: ModePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

function setThemeAttribute(themeId: string) {
  document.documentElement.setAttribute("data-theme", themeId);
  syncThemeColor();
}

/** Aligns `<meta name="theme-color">` with the `background` of the active theme and mode. */
function syncThemeColor() {
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && background) meta.setAttribute("content", background);
}

function writeThemeCookie(themeId: string) {
  // Only the theme id: no personal data. One year, readable by the server on public pages.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(themeId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

async function loadThemeFonts(themeId: string): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const { fonts } = getTheme(themeId);
  // next/font renames families (`__Fraunces_ab12`); the exposed variable holds the real name.
  const styles = getComputedStyle(document.documentElement);
  const wanted = [fonts.heading, fonts.body]
    .map((family) => styles.getPropertyValue(fontVariableName(family)).trim())
    .filter((families) => families !== "")
    .map((families) => `1em ${families}`);
  const loading = Promise.all(wanted.map((font) => document.fonts.load(font))).then(
    () => undefined,
  );
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  // A font that fails to load never blocks the theme: the fallback font stays.
  await Promise.race([loading.catch(() => undefined), timeout]);
}

// --- per-device mode preference, kept in localStorage and read through an external store ---------

const modeListeners = new Set<() => void>();

function subscribeMode(onChange: () => void): () => void {
  modeListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    modeListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readModePreference(): ModePreference {
  try {
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    return isModePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function subscribePrefersDark(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function ThemeProvider({
  initialThemeId,
  children,
}: {
  initialThemeId: string;
  children: ReactNode;
}) {
  const safeInitial = isApprovedThemeId(initialThemeId) ? initialThemeId : DEFAULT_THEME_ID;
  const [savedThemeId, setSavedThemeId] = useState(safeInitial);
  const [activeThemeId, setActiveThemeId] = useState(safeInitial);

  // Follow the server value when it changes (navigation after the partner changed the theme).
  const [seenInitial, setSeenInitial] = useState(safeInitial);
  if (seenInitial !== safeInitial) {
    setSeenInitial(safeInitial);
    setSavedThemeId(safeInitial);
    setActiveThemeId(safeInitial);
  }

  const modePreference = useSyncExternalStore(
    subscribeMode,
    readModePreference,
    (): ModePreference => "system",
  );
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  const mode = resolveMode(modePreference, prefersDark);

  // The inline script already set `data-mode` before the first paint; keep it in step afterwards.
  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
    syncThemeColor();
  }, [mode]);

  const setModePreference = useCallback((preference: ModePreference) => {
    try {
      if (preference === "system") window.localStorage.removeItem(MODE_STORAGE_KEY);
      else window.localStorage.setItem(MODE_STORAGE_KEY, preference);
    } catch {
      // private mode: the preference only lasts for this page
    }
    modeListeners.forEach((listener) => listener());
  }, []);

  const preview = useCallback(async (themeId: string) => {
    if (!isApprovedThemeId(themeId)) return;
    await loadThemeFonts(themeId);
    setThemeAttribute(themeId);
    setActiveThemeId(themeId);
  }, []);

  const cancelPreview = useCallback(() => {
    setThemeAttribute(savedThemeId);
    setActiveThemeId(savedThemeId);
  }, [savedThemeId]);

  const confirmSaved = useCallback((themeId: string) => {
    if (!isApprovedThemeId(themeId)) return;
    writeThemeCookie(themeId);
    setThemeAttribute(themeId);
    setSavedThemeId(themeId);
    setActiveThemeId(themeId);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      savedThemeId,
      activeThemeId,
      isPreviewing: activeThemeId !== savedThemeId,
      modePreference,
      mode,
      preview,
      cancelPreview,
      confirmSaved,
      setModePreference,
    }),
    [
      savedThemeId,
      activeThemeId,
      modePreference,
      mode,
      preview,
      cancelPreview,
      confirmSaved,
      setModePreference,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
