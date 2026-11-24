import { describe, expect, it } from "vitest";
import { diffSuggestions } from "./suggestions";
import { tasksFor } from "./test-helpers";

const keys = (list: readonly { key: string }[]) => list.map((m) => m.key).sort();

describe("diffSuggestions (AC16, AC48, AC63, spec §5.6)", () => {
  const unknownTasks = tasksFor("unknown", "2027-09-03");

  it("unknown → civile: 6 new + choose-rite no longer relevant", () => {
    const d = diffSuggestions("civile", unknownTasks, []);
    expect(keys(d.additions)).toEqual(
      [
        "contatta-comune-celebrazione",
        "documenti-pubblicazioni",
        "richiedi-pubblicazioni",
        "regime-patrimoniale",
        "documenti-testimoni",
        "letture-musica-cerimonia",
      ].sort(),
    );
    expect(d.removals.map((t) => t.templateKey)).toEqual(["scegli-il-rito"]);
  });

  it("unknown → religioso: 10 new, 1 removal", () => {
    const d = diffSuggestions("religioso", unknownTasks, []);
    expect(d.additions).toHaveLength(10);
    expect(d.removals).toHaveLength(1);
  });

  it("unknown → simbolico: 4 new, no publications", () => {
    const d = diffSuggestions("simbolico", unknownTasks, []);
    expect(keys(d.additions)).toEqual(
      [
        "letture-musica-cerimonia",
        "scegli-celebrante",
        "valuta-matrimonio-civile",
        "scrivi-promesse-copione",
      ].sort(),
    );
    expect(keys(d.additions)).not.toContain("richiedi-pubblicazioni");
  });

  it("civile → religioso: 6 new, 2 no longer relevant; shared ones stay", () => {
    const d = diffSuggestions("religioso", tasksFor("civile", "2027-09-03"), []);
    expect(keys(d.additions)).toEqual(
      [
        "contatta-parrocchia",
        "corso-prematrimoniale",
        "certificati-parrocchia",
        "colloquio-parroco",
        "liturgia-letture-canti",
        "fiori-addobbi-chiesa",
      ].sort(),
    );
    expect(d.removals.map((t) => t.templateKey).sort()).toEqual([
      "contatta-comune-celebrazione",
      "letture-musica-cerimonia",
    ]);
  });

  it("same rite: nothing to suggest", () => {
    const d = diffSuggestions("civile", tasksFor("civile", null), []);
    expect(d.additions).toHaveLength(0);
    expect(d.removals).toHaveLength(0);
  });

  it("never re-suggests tasks the user deleted (BR6)", () => {
    const tasks = tasksFor("civile", "2027-09-03", { "regime-patrimoniale": { deleted: true } });
    const d = diffSuggestions("religioso", tasks, []);
    expect(keys(d.additions)).not.toContain("regime-patrimoniale");
    // a deleted task that stays out of the rite is not a removal either
    const del = tasksFor("unknown", null, { "scegli-il-rito": { deleted: true } });
    expect(diffSuggestions("civile", del, []).removals).toHaveLength(0);
  });

  it("never re-suggests dismissed suggestions", () => {
    const d = diffSuggestions("civile", unknownTasks, [
      { templateKey: "richiedi-pubblicazioni", kind: "add" },
      { templateKey: "scegli-il-rito", kind: "remove" },
    ]);
    expect(keys(d.additions)).not.toContain("richiedi-pubblicazioni");
    expect(d.additions).toHaveLength(5);
    expect(d.removals).toHaveLength(0);
  });

  it("a dismissal is not scoped to a rite: it survives a round-trip civile -> simbolico -> civile", () => {
    const dismissals = [{ templateKey: "richiedi-pubblicazioni", kind: "add" as const }];
    const viaSimbolico = diffSuggestions("simbolico", unknownTasks, dismissals);
    expect(keys(viaSimbolico.additions)).not.toContain("richiedi-pubblicazioni");
    const backToCivile = diffSuggestions("civile", unknownTasks, dismissals);
    expect(keys(backToCivile.additions)).not.toContain("richiedi-pubblicazioni");
  });

  it("completed tasks are never proposed for removal", () => {
    const d = diffSuggestions(
      "civile",
      tasksFor("unknown", null, { "scegli-il-rito": { status: "done" } }),
      [],
    );
    expect(d.removals).toHaveLength(0);
  });

  it("an 'add' dismissal does not hide the matching 'remove'", () => {
    const d = diffSuggestions("civile", unknownTasks, [
      { templateKey: "scegli-il-rito", kind: "add" },
    ]);
    expect(d.removals).toHaveLength(1);
  });
});
