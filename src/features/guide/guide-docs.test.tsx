import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideMarkdown } from "./GuideMarkdown";
import { stripChangelog } from "./markdown";
import { listSlugs } from "./source";

/**
 * Guards on the real functional docs (AC3, AC6): they run on what the Guide
 * renders, with the same parser, so a bad page fails CI instead of the app.
 */
function checkPage(markdown: string, slugs: readonly string[]): string[] {
  const html = renderToStaticMarkup(
    <GuideMarkdown source={stripChangelog(markdown)} slugs={slugs} />,
  );
  const problems: string[] = [];
  if (html.includes("data-guide-unresolved")) {
    problems.push("link che esce dalla cartella o verso un file sconosciuto");
  }
  const text = html.replace(/<[^>]+>/g, " ");
  if (text.includes("docs/technical")) problems.push('il testo cita "docs/technical"');

  const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((match) => Number(match[1]));
  if (levels.filter((level) => level === 1).length !== 1) problems.push("serve un solo H1");
  if (/<h1[^>]*>\s*<\/h1>/.test(html)) problems.push("H1 vuoto");
  levels.forEach((level, i) => {
    if (i > 0 && level > (levels[i - 1] ?? 0) + 1) problems.push(`salto di livello H${level}`);
  });
  return problems;
}

const DIR = join(process.cwd(), "docs", "functional");
const SLUGS = listSlugs(readdirSync(DIR));

describe("the real functional docs, as the Guide renders them", () => {
  it.each(SLUGS)("%s.md is a clean guide page", (slug) => {
    const source = readFileSync(join(DIR, `${slug}.md`), "utf8");
    expect(checkPage(source, SLUGS)).toEqual([]);
  });
});

describe("checkPage (fixtures that must fail)", () => {
  it("accepts a clean page and external https links", () => {
    expect(checkPage("# T\n\n[sito](https://example.com)\n\n## S\n\n### U\n", SLUGS)).toEqual([]);
  });

  it("ignores the changelog", () => {
    const md = "# T\n\n## Storico delle modifiche\n\n[x](../technical/x.md)\n";
    expect(checkPage(md, SLUGS)).toEqual([]);
  });

  it("fails on a link outside the folder", () => {
    expect(checkPage("# T\n\n[x](../technical/x.md)\n", SLUGS)).toEqual([
      "link che esce dalla cartella o verso un file sconosciuto",
    ]);
  });

  it("fails on a mention of docs/technical", () => {
    expect(checkPage("# T\n\nVedi docs/technical per i dettagli.\n", SLUGS)).toEqual([
      'il testo cita "docs/technical"',
    ]);
  });

  it("fails on a heading jump", () => {
    expect(checkPage("# T\n\n### Salto\n", SLUGS)).toEqual(["salto di livello H3"]);
  });

  it("fails without exactly one H1", () => {
    expect(checkPage("## Solo H2\n", SLUGS)).toContain("serve un solo H1");
    expect(checkPage("# A\n\n# B\n", SLUGS)).toContain("serve un solo H1");
  });
});
