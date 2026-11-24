import { describe, expect, it } from "vitest";
import { displayName, fullName } from "./display-name";

describe("displayName", () => {
  it("prefers the first name, then the label, then the generic fallback", () => {
    expect(displayName({ firstName: " Jessica ", label: "Sposa" })).toBe("Jessica");
    expect(displayName({ firstName: "  ", label: "Sposa" })).toBe("Sposa");
    expect(displayName({ firstName: null, label: null })).toBe("il tuo partner");
    expect(displayName(null)).toBe("il tuo partner");
    expect(displayName(undefined, "qualcuno")).toBe("qualcuno");
  });

  it("builds a full name", () => {
    expect(fullName({ firstName: "Tony", lastName: "Rossi" })).toBe("Tony Rossi");
    expect(fullName({ firstName: "Tony" })).toBe("Tony");
    expect(fullName({ label: "Sposo" })).toBe("Sposo");
  });
});
