import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseIndexTable } from "./markdown";
import { checkIndex, isGuideSlug, listSlugs, loadGuide } from "./source";

const DIR = join(process.cwd(), "docs", "functional");

describe("listSlugs", () => {
  it("keeps lowercase .md files and drops README and anything else", () => {
    expect(
      listSlugs(["README.md", "budget.md", "Budget.md", "a_b.md", "nota.txt", "temi-e-aspetto.md"]),
    ).toEqual(["budget", "temi-e-aspetto"]);
  });
});

describe("isGuideSlug", () => {
  const slugs = ["budget", "scelte"];

  it("accepts a real slug", () => {
    expect(isGuideSlug("budget", slugs)).toBe(true);
  });

  it.each(["../package", "README", "Budget", "budget.md", "", "budget/x"])("rejects %j", (slug) => {
    expect(isGuideSlug(slug, slugs)).toBe(false);
  });
});

describe("checkIndex (fixtures)", () => {
  const readme = [
    "| Pagina | Di cosa parla |",
    "|---|---|",
    "| [Budget](budget.md) | Totale |",
    "| [Scelte](scelte.md) | Decisioni |",
  ].join("\n");

  it("is empty when table and folder agree", () => {
    expect(checkIndex(readme, ["budget", "scelte"])).toEqual([]);
  });

  it("reports a file missing from the table", () => {
    expect(checkIndex(readme, ["budget", "scelte", "nuovo"])).toEqual([
      "nuovo.md non è nella tabella di README.md",
    ]);
  });

  it("reports a row citing a missing file", () => {
    expect(checkIndex(readme, ["budget"])).toEqual(["la tabella cita scelte.md, che non esiste"]);
  });

  it("reports empty label and description", () => {
    const bad = "| P | D |\n|---|---|\n| [](budget.md) |  |";
    expect(checkIndex(bad, ["budget"])).toEqual([
      "budget.md: nome vuoto nella tabella",
      "budget.md: descrizione vuota nella tabella",
    ]);
  });
});

describe("the real docs/functional folder", () => {
  const files = readdirSync(DIR);
  const slugs = listSlugs(files);
  const readme = readFileSync(join(DIR, "README.md"), "utf8");

  it("has a README table that matches every page, both ways", () => {
    expect(checkIndex(readme, slugs)).toEqual([]);
    expect(parseIndexTable(readme).length).toBe(slugs.length);
  });

  it("loadGuide returns the same pages in README order", async () => {
    const guide = await loadGuide();
    expect(guide.slugs).toEqual(slugs);
    expect(guide.index.map((entry) => entry.slug)).toEqual(
      parseIndexTable(readme).map((entry) => entry.slug),
    );
    for (const slug of slugs) expect(guide.pages.get(slug)).toBeTruthy();
  });
});
