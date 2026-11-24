import { describe, expect, it } from "vitest";
import { escapeHtml, safeUrl, singleLine } from "./escape";

describe("escape", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml(`<script>alert("x")&'\``)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;&#96;",
    );
  });
  it("removes line breaks (header injection)", () => {
    expect(singleLine("Ciao\r\nBcc: a@example.test\u2028x")).toBe("Ciao Bcc: a@example.test x");
  });
  it("only allows http(s) links", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("not a url")).toBe("#");
    expect(safeUrl("https://example.test/a?b=1")).toBe("https://example.test/a?b=1");
  });
});
