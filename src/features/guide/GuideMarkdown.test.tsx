import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuideIndex } from "./GuideIndex";
import { GuideMarkdown } from "./GuideMarkdown";

const SLUGS = ["budget", "scelte"];
const render = (source: string) =>
  renderToStaticMarkup(<GuideMarkdown source={source} slugs={SLUGS} label="Budget" />);

describe("GuideMarkdown", () => {
  it("gives the H1 an id and makes it focusable", () => {
    const html = render("# Budget\n\ntesto");
    expect(html).toMatch(/<h1[^>]*id="guida-titolo"/);
    expect(html).toMatch(/<h1[^>]*tabindex="-1"/);
  });

  it("wraps tables in a focusable named region with column headers", () => {
    const html = render("| A | B |\n|---|---|\n| 1 | 2 |\n");
    expect(html).toMatch(/<div[^>]*role="region"[^>]*aria-label="Tabella: Budget"/);
    expect(html).toMatch(/<div[^>]*tabindex="0"/);
    expect(html).toContain('<th scope="col"');
    expect(html).not.toMatch(/<th(?=[ >])(?![^>]*scope="col")/);
  });

  it("drops raw HTML", () => {
    const html = render("Ciao <script>alert(1)</script> <b>x</b>\n\n<div>blocco</div>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("blocco");
  });

  it("keeps a known .md link inside the Guide, underlined", () => {
    const html = render("Vedi [il budget](budget.md).");
    expect(html).toMatch(/<a[^>]*href="\/guida\/budget"/);
    expect(html).toContain("underline");
    expect(html).not.toContain("target=");
  });

  it("opens external links in a new tab with icon and hidden text", () => {
    const html = render("[sito](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("(si apre in una nuova scheda)");
    expect(html).toContain("underline");
  });

  it.each(["[x](../technical/README.md)", "[x](#ancora)", "[x](ignoto.md)", "[x](javascript:1)"])(
    "shows %s as plain text",
    (source) => {
      const html = render(source);
      expect(html).toContain("data-guide-unresolved");
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("href=");
    },
  );

  it("styles inline code and scrollable code blocks", () => {
    const html = render("`1.500,00`\n\n```\nriga lunga\n```\n");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toMatch(/<pre[^>]*tabindex="0"/);
  });

  it("uses theme tokens only, no literal colours", () => {
    const html = render("# T\n\n[a](budget.md) `c`\n\n| A |\n|---|\n| 1 |\n");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|text-(red|blue|green|gray)-/);
  });
});

describe("GuideIndex", () => {
  it("renders one link per entry, in order", () => {
    const html = renderToStaticMarkup(
      <GuideIndex
        entries={[
          { slug: "b", label: "Beta", description: "Seconda" },
          { slug: "a", label: "Alfa", description: "Prima" },
        ]}
      />,
    );
    expect(html.indexOf("/guida/b")).toBeLessThan(html.indexOf("/guida/a"));
    expect(html).toContain("Beta");
    expect(html).toContain("Prima");
  });

  it("shows the empty message", () => {
    expect(renderToStaticMarkup(<GuideIndex entries={[]} />)).toContain(
      "Per ora non c&#x27;è nulla da leggere.",
    );
  });
});
