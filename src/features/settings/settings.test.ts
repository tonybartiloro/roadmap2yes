import { describe, expect, it } from "vitest";
import { formatSettingsValue } from "./field-labels";
import { recomputeUnknown } from "./model";
import { personSchema, settingsSchema } from "./schemas";

describe("recomputeUnknown", () => {
  const base = {
    rite: "civile" as const,
    guestBand: "50_80",
    styleLabel: "Boho",
    styleNote: null,
    region: null,
    comune: null,
    hasBudget: true,
  };

  it("keeps what the form does not own and recomputes what it owns", () => {
    expect(recomputeUnknown(["partner", "dates", "rite", "budget"], base)).toEqual([
      "partner",
      "dates",
    ]);
  });

  it("marks the answers left as 'non lo so'", () => {
    expect(
      recomputeUnknown([], {
        ...base,
        rite: "unknown",
        guestBand: null,
        styleLabel: null,
        hasBudget: false,
      }),
    ).toEqual(["rite", "guests", "style", "budget"]);
  });

  it("a place alone is a style-and-place answer", () => {
    expect(recomputeUnknown([], { ...base, styleLabel: null, comune: "Lucca" })).toEqual([]);
  });
});

describe("conflict values", () => {
  it("shows the Italian words, not the codes", () => {
    expect(formatSettingsValue("rite", "religioso")).toBe("Religioso cattolico con effetti civili");
    expect(formatSettingsValue("guestBand", "over_120")).toBe("Oltre 120");
    expect(formatSettingsValue("comune", null)).toBe("—");
  });
});

describe("settings schemas", () => {
  const valid = {
    version: 3,
    rite: "civile",
    guestBand: null,
    styleLabel: null,
    styleNote: "  ",
    region: "Toscana",
    comune: "Lucca",
  };

  it("accepts a normal save and trims empty text to null", () => {
    const parsed = settingsSchema.safeParse(valid);
    expect(parsed.success && parsed.data.styleNote).toBeNull();
  });

  it("refuses out-of-list values and a missing version", () => {
    expect(settingsSchema.safeParse({ ...valid, region: "Atlantide" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, rite: "pagano" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, version: 0 }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, styleNote: "x".repeat(501) }).success).toBe(false);
  });

  it("a person has no date of birth and no email field (AC46, AC58)", () => {
    const parsed = personSchema.safeParse({
      partnerId: "6f1c1d1e-0000-4000-8000-000000000000",
      version: 1,
      firstName: "Anna",
      lastName: null,
      label: "sposa",
      email: "x@example.test",
      dateOfBirth: "1990-01-01",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && Object.keys(parsed.data)).not.toContain("email");
    expect(parsed.success && Object.keys(parsed.data)).not.toContain("dateOfBirth");
  });
});
