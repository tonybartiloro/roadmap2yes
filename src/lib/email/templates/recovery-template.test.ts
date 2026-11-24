import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(
  new URL("../../../../supabase/templates/recovery.html", import.meta.url),
  "utf8",
);

describe("supabase recovery template", () => {
  it("is link-only: token_hash link to /auth/conferma, no OTP, no ConfirmationURL", () => {
    expect(html).toContain("{{ .TokenHash }}");
    expect(html).toContain("type=recovery");
    expect(html).toContain("/auth/conferma?token_hash=");
    expect(html).not.toContain("{{ .Token }}");
    expect(html).not.toContain("{{ .ConfirmationURL }}");
  });
  it("is Italian and not unsubscribable", () => {
    expect(html).toContain('lang="it"');
    expect(html).toContain("non si può disattivare");
    expect(html).not.toContain("disattiva?");
  });
});
