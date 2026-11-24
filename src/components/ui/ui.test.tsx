import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { Progress } from "./progress";

describe("ui base components", () => {
  it("Button renders a real <button> with a 44 px touch target by default", () => {
    const html = renderToStaticMarkup(<Button>Salva</Button>);
    expect(html).toContain("<button");
    expect(html).toContain("h-11");
    expect(html).toContain("Salva");
  });

  it("Button asChild renders the child element, not a nested button", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="/percorso">Vai</a>
      </Button>,
    );
    expect(html).toContain("<a ");
    expect(html).toContain('href="/percorso"');
    expect(html).not.toContain("<button");
  });

  it("Input uses 16 px text so iOS does not zoom, and forwards attributes", () => {
    const html = renderToStaticMarkup(<Input type="password" autoComplete="current-password" />);
    expect(html).toContain("text-base");
    expect(html).toContain('type="password"');
    // HTML attribute names are case-insensitive: React may serialise `autoComplete` either way.
    expect(html.toLowerCase()).toContain('autocomplete="current-password"');
  });

  it("Label renders a <label>", () => {
    expect(renderToStaticMarkup(<Label htmlFor="x">Email</Label>)).toContain("<label");
  });

  it("Progress exposes its value to assistive technology", () => {
    const html = renderToStaticMarkup(<Progress value={40} aria-label="Budget usato" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="40"');
  });
});
