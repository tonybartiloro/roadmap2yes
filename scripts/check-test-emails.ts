/**
 * Guard "emails only @example.test" (plan §12, brief AC45, risk R11).
 *
 * Scans every tracked or not-ignored file in the repository (docs and `.adf/` included) and
 * fails when an email address uses a domain other than `example.test`. The offending address is
 * NEVER printed (CI logs of a public repo are public): only `file:line`.
 *
 * Usage: `npm run check:test-emails` (also part of `npm run lint`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ALLOWED_DOMAIN = "example.test";

// Technical addresses that are not people (git over SSH URLs).
const ALLOWED_ADDRESSES = new Set(["git@github.com"]);

// local part @ domain whose LAST label is alphabetic (so `pkg@1.2.3` or `pkg@16.4.6` never match).
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz|wasm|lock)$/i;
const MAX_BYTES = 2_000_000;

export type Finding = { file: string; line: number };

/** Lines (1-based) of `text` that contain an email outside `@example.test`. */
export function findForbiddenEmailLines(text: string): number[] {
  const lines: number[] = [];
  text.split(/\r?\n/).forEach((content, index) => {
    for (const match of content.matchAll(EMAIL)) {
      const address = match[0].toLowerCase();
      const domain = (match[1] ?? "").toLowerCase();
      if (domain === ALLOWED_DOMAIN || ALLOWED_ADDRESSES.has(address)) continue;
      lines.push(index + 1);
      break;
    }
  });
  return lines;
}

export function listRepoFiles(cwd = process.cwd()): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return out.split("\0").filter(Boolean);
}

export function scanRepository(cwd = process.cwd()): Finding[] {
  const findings: Finding[] = [];
  for (const file of listRepoFiles(cwd)) {
    if (SKIP_EXTENSIONS.test(file)) continue;
    let size: number;
    try {
      size = statSync(`${cwd}/${file}`).size;
    } catch {
      continue; // deleted in the working tree but still in the index
    }
    if (size > MAX_BYTES) continue;
    const text = readFileSync(`${cwd}/${file}`, "utf8");
    if (text.includes("\0")) continue; // binary
    for (const line of findForbiddenEmailLines(text)) findings.push({ file, line });
  }
  return findings;
}

function main(): void {
  const findings = scanRepository();
  if (findings.length === 0) {
    console.log(`check-test-emails: OK (only @${ALLOWED_DOMAIN} addresses).`);
    return;
  }
  console.error(`check-test-emails: email outside @${ALLOWED_DOMAIN} found (value not printed):`);
  for (const { file, line } of findings) console.error(`  ${file}:${line}`);
  console.error("Use fake @example.test addresses only: this repository is public.");
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
