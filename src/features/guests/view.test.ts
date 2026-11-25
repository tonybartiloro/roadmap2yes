import { describe, expect, it } from "vitest";
import { compareNames } from "./view";

const g = (firstName: string, lastName: string | null) => ({ firstName, lastName });

describe("compareNames (design 2.1: alphabetical flat list)", () => {
  it("sorts by last name, then first name, ignoring case and accents", () => {
    const sorted = [
      g("Mario", "Rossi"),
      g("Anna", "Verdi"),
      g("Luca", "Rossi"),
      g("Èva", "Bianchi"),
      g("Carlo", "Neri"),
      g("anna", "Rossi"),
    ].toSorted(compareNames);
    expect(sorted.map((x) => `${x.firstName} ${x.lastName}`)).toEqual([
      "Èva Bianchi",
      "Carlo Neri",
      "anna Rossi",
      "Luca Rossi",
      "Mario Rossi",
      "Anna Verdi",
    ]);
  });

  it("puts people without a last name first, by first name", () => {
    const sorted = [g("Zoe", null), g("Mario", "Rossi"), g("Anna", null)].toSorted(compareNames);
    expect(sorted.map((x) => x.firstName)).toEqual(["Anna", "Zoe", "Mario"]);
  });
});
