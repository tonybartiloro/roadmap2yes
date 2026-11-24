/** Hex colour `#RRGGBB`. */
export type Hex = `#${string}`;

/** Per-theme, per-mode tokens (design §5.2). `ring` is always `primary`. */
export interface ThemeTokens {
  background: Hex;
  foreground: Hex;
  card: Hex;
  muted: Hex;
  mutedForeground: Hex;
  primary: Hex;
  primaryForeground: Hex;
  /** Graphic only (rules, icons, bars; >=3:1 on background and card). NEVER text, NEVER on muted. */
  accent: Hex;
  /** Decorative. */
  border: Hex;
  /** Border of form fields (>=3:1). */
  input: Hex;
}

/** Semantic tokens shared by every theme, recomputed per mode (design §5.2). */
export interface SemanticTokens {
  success: Hex;
  successForeground: Hex;
  warning: Hex;
  warningForeground: Hex;
  destructive: Hex;
  destructiveForeground: Hex;
}

export interface Theme {
  id: string;
  name: string;
  mood: string;
  fonts: { heading: string; body: string };
  light: ThemeTokens;
  dark: ThemeTokens;
}

export type ThemeMode = "light" | "dark";
