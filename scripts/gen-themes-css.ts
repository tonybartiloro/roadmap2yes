import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES } from "../src/themes/catalog";
import { generateThemesCss } from "../src/themes/css";

/**
 * `npm run gen:themes`: writes `src/app/themes.css` from the catalogue. CI reruns it and fails on
 * any diff (`git diff --exit-code`). `--check` only compares and exits 1 when out of date.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "src/app/themes.css");
const css = generateThemesCss(THEMES);

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {
    // missing file counts as out of date
  }
  if (current !== css) {
    console.error("src/app/themes.css is out of date: run `npm run gen:themes`.");
    process.exit(1);
  }
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, css);
  console.log(`Wrote src/app/themes.css (${THEMES.length} themes).`);
}
