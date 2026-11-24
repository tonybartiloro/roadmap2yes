import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPROVED_THEME_IDS, DEFAULT_THEME_ID, getTheme, resolveThemeId } from "./approved";
import { THEMES } from "./catalog";
import { generateThemesCss } from "./css";
import { fontVariableName } from "./font-names";
import { FONT_WEIGHTS } from "./font-specs";

describe("generateThemesCss", () => {
  const css = generateThemesCss(THEMES);

  it("is up to date with the committed src/app/themes.css", () => {
    expect(readFileSync(join(process.cwd(), "src/app/themes.css"), "utf8")).toBe(css);
  });

  it("never scopes to :root and defines one light and one dark block per theme", () => {
    expect(css).not.toContain(":root");
    for (const id of APPROVED_THEME_IDS) {
      expect(css).toContain(`[data-theme="${id}"] {`);
      expect(css).toContain(`[data-theme="${id}"][data-mode="dark"] {`);
    }
  });

  it("exposes every token the ui components use, in light and dark", () => {
    const required = [
      "background",
      "foreground",
      "card",
      "muted",
      "muted-foreground",
      "primary",
      "primary-foreground",
      "border",
      "input",
      "ring",
      "destructive",
      "destructive-foreground",
      "success",
      "warning",
    ];
    for (const block of css.split("\n\n").filter((b) => b.includes("[data-theme"))) {
      for (const token of required) expect(block, token).toContain(`--${token}:`);
    }
  });

  it("maps fonts to variables of declared families", () => {
    for (const theme of THEMES) {
      expect(css).toContain(`var(${fontVariableName(theme.fonts.heading)})`);
      expect(FONT_WEIGHTS[theme.fonts.heading], theme.id).toBeDefined();
      expect(FONT_WEIGHTS[theme.fonts.body], theme.id).toBeDefined();
    }
  });
});

describe("theme resolution (DB, cookie, default)", () => {
  it("prefers the DB, then the cookie, then giardino", () => {
    expect(resolveThemeId("sera", "boho")).toBe("sera");
    expect(resolveThemeId(null, "boho")).toBe("boho");
    expect(resolveThemeId(undefined, undefined)).toBe(DEFAULT_THEME_ID);
  });

  it("falls through on ids that are not approved (never trusts raw input)", () => {
    expect(resolveThemeId("nope", "boho")).toBe("boho");
    expect(resolveThemeId("nope", "<script>")).toBe("giardino");
    expect(resolveThemeId("", "")).toBe("giardino");
  });

  it("getTheme falls back to the default", () => {
    expect(getTheme("zzz").id).toBe("giardino");
  });
});

describe("font declarations", () => {
  const source = readFileSync(join(process.cwd(), "src/themes/fonts.ts"), "utf8");

  it("fonts.ts declares every family with the weights of font-specs.ts", () => {
    for (const [family, weights] of Object.entries(FONT_WEIGHTS)) {
      const call = family.replace(/ /g, "_");
      const pattern = new RegExp(
        `${call}\\(\\{[^}]*weight: \\[${weights.map((w) => `"${w}"`).join(", ")}\\][^}]*variable: "${fontVariableName(family)}"`,
      );
      expect(source, family).toMatch(pattern);
    }
  });

  it("uses latin, swap and no preload everywhere", () => {
    const count = Object.keys(FONT_WEIGHTS).length;
    expect(source.match(/subsets: \["latin"\]/g)).toHaveLength(count);
    expect(source.match(/display: "swap"/g)).toHaveLength(count);
    expect(source.match(/preload: false/g)).toHaveLength(count);
  });

  it("every theme stays within 4 faces (static upper bound)", () => {
    for (const theme of THEMES) {
      const faces =
        (FONT_WEIGHTS[theme.fonts.heading]?.length ?? 99) +
        (FONT_WEIGHTS[theme.fonts.body]?.length ?? 99);
      expect(faces, theme.id).toBeLessThanOrEqual(4);
    }
  });
});
