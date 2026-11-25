import { describe, expect, it } from "vitest";
import { extractTitle, parseIndexTable, resolveGuideHref, stripChangelog } from "./markdown";

describe("stripChangelog", () => {
  it("removes the changelog at the end", () => {
    const md = "# T\n\ntesto\n\n## Storico delle modifiche\n\n| a |\n|---|\n| b |\n";
    expect(stripChangelog(md)).toBe("# T\n\ntesto\n");
  });

  it("removes it in the middle and keeps the next section", () => {
    const md = "# T\n\n## Storico delle modifiche\n\nvecchio\n\n## Dopo\n\nresta\n";
    const out = stripChangelog(md);
    expect(out).not.toContain("vecchio");
    expect(out).toContain("## Dopo");
    expect(out).toContain("resta");
  });

  it("leaves a file without changelog untouched", () => {
    expect(stripChangelog("# T\n\ntesto\n")).toBe("# T\n\ntesto\n");
  });
});

describe("extractTitle", () => {
  it("returns the first H1 as plain text", () => {
    expect(extractTitle("# Home e **Novità**\n\ntesto")).toBe("Home e Novità");
  });

  it("ignores H2 and returns null without H1", () => {
    expect(extractTitle("## Solo H2\n")).toBeNull();
  });
});

describe("parseIndexTable", () => {
  const readme = [
    "# Doc",
    "",
    "| Pagina | Di cosa parla |",
    "|---|---|",
    "| [Panoramica](panoramica.md) | Che cos'è |",
    "| riga senza link | boh |",
    "| [Budget](budget.md) | Totale e voci |",
    "",
    "## Storico delle modifiche",
    "",
    "| [Finta](finta.md) | no |",
  ].join("\n");

  it("returns the rows in order, skipping header, separator and malformed rows", () => {
    expect(parseIndexTable(readme)).toEqual([
      { slug: "panoramica", label: "Panoramica", description: "Che cos'è" },
      { slug: "budget", label: "Budget", description: "Totale e voci" },
    ]);
  });
});

describe("resolveGuideHref", () => {
  const slugs = ["budget", "scelte"];

  it.each([
    ["budget.md", "/guida/budget"],
    ["./scelte.md", "/guida/scelte"],
    ["budget.md#a", "/guida/budget"],
    ["README.md", "/guida"],
  ])("%s stays in the guide", (href, expected) => {
    expect(resolveGuideHref(href, slugs)).toEqual({ kind: "internal", href: expected });
  });

  it.each(["https://example.com/x", "http://example.com", "mailto:a@example.test"])(
    "%s is external",
    (href) => {
      expect(resolveGuideHref(href, slugs)).toEqual({ kind: "external", href });
    },
  );

  it.each([
    "../technical/README.md",
    "../technical/x.md",
    "#ancora",
    "ignoto.md",
    "javascript:alert(1)",
    "budget",
    "../budget.md",
    "",
  ])("%s is plain text", (href) => {
    expect(resolveGuideHref(href, slugs)).toEqual({ kind: "text" });
  });

  it("treats a missing href as text", () => {
    expect(resolveGuideHref(undefined, slugs)).toEqual({ kind: "text" });
  });
});
