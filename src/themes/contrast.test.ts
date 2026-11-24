import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPROVED_THEME_IDS } from "./approved";
import { THEMES } from "./catalog";
import { checkTokens, contrastRatio, relativeLuminance, REQUIRED_PAIRS } from "./contrast";
import type { Hex } from "./types";

describe("WCAG calculator (known vectors)", () => {
  it.each([
    ["#000000", "#FFFFFF", 21],
    ["#FFFFFF", "#FFFFFF", 1],
    ["#767676", "#FFFFFF", 4.54],
    ["#777777", "#FFFFFF", 4.48],
    ["#0000FF", "#FFFFFF", 8.59],
    ["#FF0000", "#FFFFFF", 4.0],
    ["#808080", "#000000", 5.32],
  ] as const)("%s on %s is %s:1", (fg, bg, expected) => {
    expect(contrastRatio(fg, bg)).toBeCloseTo(expected, 1);
    expect(contrastRatio(bg, fg)).toBeCloseTo(expected, 1);
  });

  it("luminance of black and white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
  });

  it("rejects malformed colours", () => {
    expect(() => relativeLuminance("#FFF" as Hex)).toThrow();
  });
});

/** Parses the GENERATED css, so the gate covers what actually ships. */
function parseGenerated(): Map<string, Record<string, Hex>> {
  const css = readFileSync(join(process.cwd(), "src/app/themes.css"), "utf8");
  const result = new Map<string, Record<string, Hex>>();
  for (const [, selector, body] of css.matchAll(/(\[data-theme[^{]+)\{([^}]*)\}/g)) {
    const match = /data-theme="([^"]+)"\](\[data-mode="dark"\])?/.exec(selector ?? "");
    if (!match) continue;
    const key = `${match[1]}:${match[2] ? "dark" : "light"}`;
    const tokens: Record<string, Hex> = {};
    for (const [, name, value] of (body ?? "").matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)) {
      const camel = (name ?? "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      tokens[camel] = value as Hex;
    }
    result.set(key, tokens);
  }
  return result;
}

describe("theme contrast gate (generated themes.css, light and dark)", () => {
  const generated = parseGenerated();

  it("covers all approved themes in both modes", () => {
    expect(APPROVED_THEME_IDS).toHaveLength(12);
    for (const id of APPROVED_THEME_IDS) {
      expect(generated.has(`${id}:light`), `${id} light`).toBe(true);
      expect(generated.has(`${id}:dark`), `${id} dark`).toBe(true);
    }
  });

  it("checks accent only on background and card (never on muted)", () => {
    const accent = REQUIRED_PAIRS.filter((pair) => pair.fg === "accent");
    expect(accent.map((pair) => pair.bg).sort()).toEqual(["background", "card"]);
  });

  for (const id of APPROVED_THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`${id} ${mode}: every pair passes`, () => {
        const tokens = generated.get(`${id}:${mode}`);
        expect(tokens).toBeDefined();
        const failures = checkTokens(tokens ?? {})
          .filter((result) => !result.pass)
          .map((r) => `${r.fg}/${r.bg} ${r.ratio.toFixed(2)} < ${r.min}`);
        expect(failures).toEqual([]);
      });
    }
  }

  it("the catalogue and the generated css agree on primary and background", () => {
    for (const theme of THEMES) {
      expect(generated.get(`${theme.id}:light`)?.["primary"]).toBe(
        theme.light.primary.toLowerCase(),
      );
      expect(generated.get(`${theme.id}:dark`)?.["background"]).toBe(
        theme.dark.background.toLowerCase(),
      );
    }
  });
});
