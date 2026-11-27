import { describe, expect, it } from "vitest";
import { NEUTRAL_HEADING, NEUTRAL_TEXT, neutralHtml } from "./neutral-html";

describe("neutralHtml", () => {
  it("is script-free, accessible, brand-free and identical on every call", () => {
    const html = neutralHtml();
    expect(html).toBe(neutralHtml());
    expect(html).toContain('<html lang="it">');
    expect(html).toContain("width=device-width");
    expect(html).toContain("prefers-color-scheme:dark");
    expect(html).toContain("font:18px");
    expect(html).toContain(`<h1>${NEUTRAL_HEADING}</h1>`);
    expect(html).toContain(NEUTRAL_TEXT);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script|<a |<button|roadmap2yes|__next_error__/i);
  });
});
