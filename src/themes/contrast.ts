import type { Hex } from "./types";

/** WCAG 2.x relative luminance of `#RRGGBB`. */
export function relativeLuminance(hex: Hex): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Invalid hex colour: ${hex}`);
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: Hex, b: Hex): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Thresholds (WCAG 2.2 AA): normal text 4.5, UI components / graphics 3. */
export const TEXT_MIN = 4.5;
export const UI_MIN = 3;

export interface PairSpec {
  readonly fg: string;
  readonly bg: string;
  readonly min: number;
}

const textPairs = (fgs: string[], bgs: string[]): PairSpec[] =>
  fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, min: TEXT_MIN })));

/**
 * Every pair the interface can render (design §5.2 + extended F2 check). Rule baked in:
 * `accent` is checked on `background` and `card` ONLY (never on `muted`, never as text).
 */
export const REQUIRED_PAIRS: readonly PairSpec[] = [
  ...textPairs(["foreground"], ["background", "card", "muted"]),
  ...textPairs(["mutedForeground"], ["background", "card", "muted"]),
  ...textPairs(["primary"], ["background", "card", "muted"]),
  { fg: "primaryForeground", bg: "primary", min: TEXT_MIN },
  ...textPairs(["success", "warning", "destructive"], ["background", "card", "muted"]),
  { fg: "successForeground", bg: "success", min: TEXT_MIN },
  { fg: "warningForeground", bg: "warning", min: TEXT_MIN },
  { fg: "destructiveForeground", bg: "destructive", min: TEXT_MIN },
  ...["accent", "input"].flatMap((fg) =>
    ["background", "card"].map((bg) => ({ fg, bg, min: UI_MIN })),
  ),
  { fg: "input", bg: "muted", min: UI_MIN },
];

export interface PairResult extends PairSpec {
  readonly ratio: number;
  readonly pass: boolean;
}

/** Evaluates `REQUIRED_PAIRS` over a flat token map (camelCase names). */
export function checkTokens(tokens: Readonly<Record<string, Hex>>): PairResult[] {
  return REQUIRED_PAIRS.map((pair) => {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) throw new Error(`Missing token for pair ${pair.fg}/${pair.bg}`);
    const ratio = contrastRatio(fg, bg);
    return { ...pair, ratio, pass: ratio >= pair.min };
  });
}
