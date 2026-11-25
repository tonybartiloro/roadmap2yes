import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseIndexTable, type GuideIndexEntry } from "./markdown";

/** The Guide reads the functional docs as they are: one source, no copies (R1). */
const DOCS_DIR = ["docs", "functional"] as const;

const SLUG_FILE = /^([a-z0-9-]+)\.md$/;

export type Guide = {
  /** Index rows (README table order) whose file exists. */
  index: GuideIndexEntry[];
  /** Every page that can be opened (real file names, README excluded). */
  slugs: string[];
  /** Markdown source by slug. */
  pages: ReadonlyMap<string, string>;
};

/** Slugs from a directory listing: lowercase `*.md`, README excluded, sorted. */
export function listSlugs(fileNames: readonly string[]): string[] {
  return fileNames
    .map((name) => SLUG_FILE.exec(name)?.[1])
    .filter((slug): slug is string => slug !== undefined)
    .sort();
}

/** A page opens only when its slug is exactly one of the real files (R3). */
export function isGuideSlug(slug: string, slugs: readonly string[]): boolean {
  return slugs.includes(slug);
}

/** Problems that make the README table disagree with the folder (empty = fine). */
export function checkIndex(readme: string, slugs: readonly string[]): string[] {
  const problems: string[] = [];
  const entries = parseIndexTable(readme);
  const listed = new Set<string>();
  for (const entry of entries) {
    if (listed.has(entry.slug)) problems.push(`${entry.slug}.md compare più volte nella tabella`);
    listed.add(entry.slug);
    if (!slugs.includes(entry.slug))
      problems.push(`la tabella cita ${entry.slug}.md, che non esiste`);
    if (entry.label === "") problems.push(`${entry.slug}.md: nome vuoto nella tabella`);
    if (entry.description === "")
      problems.push(`${entry.slug}.md: descrizione vuota nella tabella`);
  }
  for (const slug of slugs) {
    if (!listed.has(slug)) {
      problems.push(`${slug}.md non è nella tabella di README.md`);
    }
  }
  return problems;
}

async function readGuide(): Promise<Guide> {
  const dir = join(process.cwd(), ...DOCS_DIR);
  // A missing folder throws: the error page is better than an empty Guide.
  const files = await readdir(dir);
  const slugs = listSlugs(files);
  const readme = await readFile(join(dir, "README.md"), "utf8");
  const pages = new Map<string, string>();
  for (const slug of slugs) pages.set(slug, await readFile(join(dir, `${slug}.md`), "utf8"));
  const index = parseIndexTable(readme).filter((entry) => pages.has(entry.slug));
  return { index, slugs, pages };
}

let cached: Promise<Guide> | undefined;

/** Reads the folder; memoised per instance in production only (dev sees edits). */
export function loadGuide(): Promise<Guide> {
  if (process.env.NODE_ENV !== "production") return readGuide();
  cached ??= readGuide().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
