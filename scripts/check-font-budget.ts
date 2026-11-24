import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES } from "../src/themes/catalog";
import { FONT_WEIGHTS } from "../src/themes/font-specs";

/**
 * `npm run check:fonts` (plan §8, DES-22). Per theme: at most 4 woff2 files and about 120 KB for
 * the two families it uses (only the `latin` face is counted: it is the only one a page in Italian
 * downloads, the browser skips faces whose `unicode-range` is not needed).
 *
 * 1. Static check (always): weights per family from `src/themes/font-specs.ts`.
 * 2. Build check: reads the `@font-face` rules `next build` emitted in `.next/static` and measures
 *    the real woff2 files. In CI (`CI=true`) a missing build is an error; locally it is skipped
 *    with a notice (run `npm run build` first).
 */
const MAX_FILES = 4;
const MAX_BYTES = 120 * 1024;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];

// 1. Static
for (const theme of THEMES) {
  const heading = FONT_WEIGHTS[theme.fonts.heading];
  const body = FONT_WEIGHTS[theme.fonts.body];
  if (!heading || !body) {
    failures.push(`${theme.id}: family not declared in font-specs.ts`);
    continue;
  }
  if (heading.length !== 1) failures.push(`${theme.id}: heading must use exactly 1 weight`);
  if (body.length > 2) failures.push(`${theme.id}: body must use at most 2 weights`);
  if (heading.length + body.length > MAX_FILES)
    failures.push(`${theme.id}: more than ${MAX_FILES} faces`);
}

// 2. Build
interface Face {
  family: string;
  file: string;
}

function listCss(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listCss(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

function latinFaces(): Face[] {
  const staticDir = join(root, ".next/static");
  const faces = new Map<string, Face>();
  for (const cssFile of listCss(staticDir)) {
    const css = readFileSync(cssFile, "utf8");
    for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      const family = /font-family:\s*"?([^;"]+?)"?\s*[;}]/.exec(body ?? "")?.[1];
      const url = /url\(([^)]+)\)/.exec(body ?? "")?.[1]?.replace(/["']/g, "");
      const range = /unicode-range:\s*([^;}]+)/.exec(body ?? "")?.[1] ?? "";
      if (!family || !url || family.endsWith("Fallback")) continue;
      // The latin subset starts at U+0000 (printed as U+??).
      if (!/U\+\?\?(,|$)/.test(range.trim())) continue;
      const file = resolve(dirname(cssFile), url);
      faces.set(`${family}|${file}`, { family, file });
    }
  }
  return [...faces.values()];
}

const kb = (bytes: number) => (bytes / 1024).toFixed(1);

if (!existsSync(join(root, ".next/static"))) {
  if (process.env["CI"]) failures.push("no build found in .next/static: run `npm run build` first");
  else console.log("Build check skipped: run `npm run build` first.");
} else {
  const faces = latinFaces();
  const rows: string[] = [];
  for (const theme of THEMES) {
    const own = faces.filter(
      (face) => face.family === theme.fonts.heading || face.family === theme.fonts.body,
    );
    const families = new Set(own.map((face) => face.family));
    for (const family of [theme.fonts.heading, theme.fonts.body]) {
      if (!families.has(family))
        failures.push(`${theme.id}: no latin face of "${family}" in the build`);
    }
    const files = [...new Set(own.map((face) => face.file))];
    const bytes = files.reduce(
      (sum, file) => sum + (existsSync(file) ? statSync(file).size : 0),
      0,
    );
    rows.push(`${theme.id.padEnd(14)} ${files.length} files  ${kb(bytes).padStart(6)} KB`);
    if (files.length > MAX_FILES)
      failures.push(`${theme.id}: ${files.length} files (max ${MAX_FILES})`);
    if (bytes > MAX_BYTES) failures.push(`${theme.id}: ${kb(bytes)} KB (max ${kb(MAX_BYTES)})`);
  }
  console.log(rows.join("\n"));
}

if (failures.length > 0) {
  console.error(`\nFont budget exceeded:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Font budget OK.");
