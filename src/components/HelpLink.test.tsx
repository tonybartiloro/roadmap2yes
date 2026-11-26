// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HELP_PAGES, HelpLink, type HelpRoute } from "./HelpLink";

afterEach(() => cleanup());

describe("HelpLink", () => {
  it("is a link named Aiuto that opens the guide page of the section", () => {
    render(<HelpLink route="/invitati" />);
    const link = screen.getByRole("link", { name: "Aiuto" });
    expect(link.getAttribute("href")).toBe("/guida/invitati");
  });

  it("keeps the text in the DOM and hides it visually only below 360 px", () => {
    render(<HelpLink route="/budget" />);
    const text = screen.getByText("Aiuto");
    expect(text.className).toContain("max-[359px]:sr-only");
  });

  it("maps every section to a guide page that exists in docs/functional", () => {
    for (const [route, page] of Object.entries(HELP_PAGES) as [HelpRoute, string][]) {
      expect(existsSync(join(process.cwd(), "docs", "functional", `${page}.md`)), route).toBe(true);
    }
  });
});
