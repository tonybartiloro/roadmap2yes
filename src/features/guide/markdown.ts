/**
 * Pure helpers for the in-app guide (no I/O, no React): what to hide, how to
 * read the page title and the README index, and the single rule on links.
 */

const CHANGELOG_HEADING = /^##\s+Storico delle modifiche\s*$/;
const H2 = /^##\s/;

export type GuideIndexEntry = { slug: string; label: string; description: string };

export type GuideHref =
  { kind: "internal"; href: string } | { kind: "external"; href: string } | { kind: "text" };

/** Drops "## Storico delle modifiche" up to the next "## " heading (or the end). */
export function stripChangelog(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (CHANGELOG_HEADING.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && H2.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join("\n").trimEnd() + "\n";
}

/** Plain text of inline Markdown: links keep their label, emphasis/code marks go. */
function plainInline(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/** Text of the first level-1 heading, or null when the file has none. */
export function extractTitle(markdown: string): string | null {
  for (const line of markdown.split("\n")) {
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match?.[1]) {
      const title = plainInline(match[1]);
      return title === "" ? null : title;
    }
  }
  return null;
}

const ROW_LINK = /^\[([^\]]*)\]\(([^)\s]*)\)$/;

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/**
 * Rows of the first table of README.md (outside the changelog), in order. A row
 * is kept only when its first cell is a link to "<slug>.md"; header, separator
 * and malformed rows are skipped.
 */
export function parseIndexTable(readme: string): GuideIndexEntry[] {
  const entries: GuideIndexEntry[] = [];
  let inTable = false;
  for (const line of stripChangelog(readme).split("\n")) {
    if (!line.trim().startsWith("|")) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    const [first = "", second = ""] = splitRow(line);
    const link = ROW_LINK.exec(first);
    const target = /^(?:\.\/)?([a-z0-9-]+)\.md$/.exec(link?.[2] ?? "");
    if (!link || !target?.[1]) continue;
    entries.push({
      slug: target[1],
      label: plainInline(link[1] ?? ""),
      description: plainInline(second),
    });
  }
  return entries;
}

/**
 * The only rule on links inside guide pages: a known "<slug>.md" stays in the
 * Guide, http(s)/mailto open outside, everything else (anchors, paths outside
 * the folder, unknown files, other schemes) is shown as plain text.
 */
export function resolveGuideHref(href: string | undefined, slugs: readonly string[]): GuideHref {
  const value = (href ?? "").trim();
  if (/^(?:https?:|mailto:)/i.test(value)) return { kind: "external", href: value };
  const match = /^(?:\.\/)?([A-Za-z0-9-]+)\.md(?:#[^\s]*)?$/.exec(value);
  if (!match?.[1]) return { kind: "text" };
  if (match[1] === "README") return { kind: "internal", href: "/guida" };
  return slugs.includes(match[1])
    ? { kind: "internal", href: `/guida/${match[1]}` }
    : { kind: "text" };
}
