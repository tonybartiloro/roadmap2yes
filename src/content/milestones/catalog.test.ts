import { describe, expect, it } from "vitest";
import {
  BUREAUCRATIC_DISCLAIMER,
  CATEGORY_LABELS,
  MILESTONES,
  MILESTONE_CATEGORIES,
  milestonesForRite,
  validateCatalog,
  getMilestone,
} from "./index";

const keys = (rite: Parameters<typeof milestonesForRite>[0]) =>
  new Set(milestonesForRite(rite).map((m) => m.key));

describe("milestone catalogue (spec §5.8)", () => {
  it("is valid", () => {
    expect(validateCatalog(MILESTONES)).toEqual([]);
  });

  it("has 53 milestones (spec says 54 by numbering, but number 38 is unused)", () => {
    expect(MILESTONES).toHaveLength(53);
  });

  it("counts per rite", () => {
    expect(milestonesForRite("civile")).toHaveLength(43);
    expect(milestonesForRite("religioso")).toHaveLength(47);
    expect(milestonesForRite("simbolico")).toHaveLength(41);
    expect(milestonesForRite("unknown")).toHaveLength(38);
  });

  it("counts bureaucratic per rite", () => {
    const bureau = (r: Parameters<typeof milestonesForRite>[0]) =>
      milestonesForRite(r).filter((m) => m.bureaucratic).length;
    expect(MILESTONES.filter((m) => m.bureaucratic)).toHaveLength(10);
    expect([bureau("civile"), bureau("religioso"), bureau("simbolico"), bureau("unknown")]).toEqual(
      [5, 8, 1, 0],
    );
  });

  it("has 4 highlighted (3 common + choose-rite) and 5 date-independent", () => {
    expect(MILESTONES.filter((m) => m.highlightFirst).map((m) => m.key)).toEqual([
      "scegli-data-e-location",
      "definisci-budget-iniziale",
      "lista-invitati-preliminare",
      "scegli-il-rito",
    ]);
    expect(MILESTONES.filter((m) => m.offset === null)).toHaveLength(5);
  });

  it("only the two post-event milestones have negative offsets", () => {
    const negative = MILESTONES.filter((m) =>
      Object.values(m.offset ?? {}).some((n) => (n ?? 0) < 0),
    ).map((m) => m.key);
    expect(negative.sort()).toEqual(["biglietti-ringraziamento", "chiudi-conti-budget-finale"]);
  });

  it("rite rules (AC25, AC63)", () => {
    expect(keys("civile").has("richiedi-pubblicazioni")).toBe(true);
    expect(keys("religioso").has("richiedi-pubblicazioni")).toBe(true);
    expect(keys("simbolico").has("richiedi-pubblicazioni")).toBe(false);
    expect(keys("religioso").has("corso-prematrimoniale")).toBe(true);
    expect(keys("civile").has("corso-prematrimoniale")).toBe(false);
    expect(keys("unknown").has("scegli-il-rito")).toBe(true);
    expect(keys("civile").has("scegli-il-rito")).toBe(false);
    for (const k of ["richiedi-pubblicazioni", "corso-prematrimoniale", "contatta-parrocchia"]) {
      expect(keys("unknown").has(k)).toBe(false);
    }
  });

  it("has a label for every category and a single disclaimer wording", () => {
    for (const c of MILESTONE_CATEGORIES) expect(CATEGORY_LABELS[c]).toBeTruthy();
    expect(BUREAUCRATIC_DISCLAIMER).toBe(
      "Indicativo: verificate sempre con il comune o la parrocchia",
    );
  });

  it("spot-checks spec values", () => {
    expect(getMilestone("invia-partecipazioni")).toMatchObject({
      offset: { months: 2, weeks: 2 },
      priority: 50,
    });
    expect(getMilestone("scegli-il-rito")).toMatchObject({
      priority: 5,
      offset: null,
      rites: ["unknown"],
    });
  });

  it("validation catches bad catalogues", () => {
    const base = MILESTONES[0]!;
    expect(validateCatalog([base, base]).some((p) => p.includes("duplicate"))).toBe(true);
    expect(validateCatalog([{ ...base, title: "x".repeat(61) }]).length).toBeGreaterThan(0);
    expect(
      validateCatalog([{ ...base, key: "tappa-x", offset: { months: -1 } }]).some((p) =>
        p.includes("negative"),
      ),
    ).toBe(true);
  });
});
