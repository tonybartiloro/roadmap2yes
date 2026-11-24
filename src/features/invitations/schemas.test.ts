import { describe, expect, it } from "vitest";
import { partnerSchema, partnerWithCodeSchema } from "./schemas";

describe("partner schemas: optional names", () => {
  it("null, empty, blank and missing all mean 'not provided'", () => {
    for (const names of [
      {},
      { firstName: null, lastName: null, label: null },
      { firstName: "", lastName: "  ", label: "" },
      { firstName: undefined },
    ]) {
      const parsed = partnerSchema.safeParse({ email: " B@Example.test ", ...names });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({
        email: "b@example.test",
        firstName: null,
        lastName: null,
        label: null,
      });
    }
    expect(
      partnerWithCodeSchema.safeParse({ email: "b@example.test", code: "x", firstName: null })
        .success,
    ).toBe(true);
  });

  it("a real name is trimmed; a too-long one is rejected on ITS field, not on the email", () => {
    expect(partnerSchema.parse({ email: "b@example.test", firstName: " Jessica " }).firstName).toBe(
      "Jessica",
    );
    const bad = partnerSchema.safeParse({ email: "b@example.test", label: "x".repeat(41) });
    expect(bad.success ? null : bad.error.issues[0]?.path[0]).toBe("label");
    const badEmail = partnerSchema.safeParse({ email: "nope", firstName: null });
    expect(badEmail.success ? null : badEmail.error.issues[0]?.path[0]).toBe("email");
  });
});
