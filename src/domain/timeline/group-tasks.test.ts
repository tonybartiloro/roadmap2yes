import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates/plain-date";
import { ADESSO_VISIBLE_ROWS, groupTasks } from "./group-tasks";
import { tasksFor, userTask } from "./test-helpers";

const TODAY = "2026-11-24";
const ids = (list: readonly { id: string }[]) => list.map((t) => t.id);

describe("groupTasks: spec §5.1 reference scenario (civile, 2027-09-03, today 2026-11-24)", () => {
  const g = groupTasks(tasksFor("civile", "2027-09-03"), TODAY);

  it("Adesso: 3 highlighted without date by priority, then the two due 2026-12-03", () => {
    expect(ids(g.adesso)).toEqual([
      "scegli-data-e-location",
      "definisci-budget-iniziale",
      "lista-invitati-preliminare",
      "scegli-abiti",
      "scegli-musica",
    ]);
  });

  it("Da recuperare: overdue by priority, with their real due dates", () => {
    expect(ids(g.daRecuperare)).toEqual([
      "conferma-location-e-caparra",
      "contatta-comune-celebrazione",
      "scegli-catering",
      "prenota-foto-e-video",
    ]);
    expect(g.daRecuperare[0]!.dueDate).toBe("2026-09-03");
  });

  it("Prossimi 3 mesi: +31..+90 days", () => {
    // by due date, then model priority (55, 70, 85 share 2027-01-03)
    expect(ids(g.prossimi3Mesi)).toEqual([
      "scegli-testimoni",
      "prenota-viaggio-nozze",
      "save-the-date",
      "apri-lista-nozze",
    ]);
    expect(g.prossimi3Mesi[0]!.dueDate).toBe("2027-01-03");
  });

  it("Più avanti has the rest (30), including the date-independent non-highlighted one; Fatti empty", () => {
    expect(g.piuAvanti).toHaveLength(30);
    expect(ids(g.piuAvanti)[0]).toBe("decidi-stile-e-priorita");
    expect(g.fatti).toHaveLength(0);
    expect(g.hidden).toHaveLength(0);
    expect(g.deleted).toHaveLength(0);
  });

  it("Adesso has exactly ADESSO_VISIBLE_ROWS rows here (spec §5.1)", () => {
    expect(g.adesso).toHaveLength(ADESSO_VISIBLE_ROWS);
  });
});

describe("groupTasks: thresholds 30/31/90/91 and overdue", () => {
  const at = (n: number) => userTask(`d${n}`, addDays(TODAY, n));
  const g = groupTasks([at(-1), at(0), at(30), at(31), at(90), at(91)], TODAY);

  it("splits at the boundaries", () => {
    expect(ids(g.daRecuperare)).toEqual(["d-1"]);
    expect(ids(g.adesso)).toEqual(["d0", "d30"]);
    expect(ids(g.prossimi3Mesi)).toEqual(["d31", "d90"]);
    expect(ids(g.piuAvanti)).toEqual(["d91"]);
  });
});

describe("groupTasks: rules (a)-(c) and ordering", () => {
  it("(a) only 3 overdue highlighted go to Adesso; extras go to Da recuperare", () => {
    // Fixture: highlighted milestones overdue (not exercised by the catalogue).
    const t = tasksFor("unknown", "2027-09-03").map((x) =>
      x.templateKey &&
      [
        "scegli-data-e-location",
        "definisci-budget-iniziale",
        "lista-invitati-preliminare",
        "scegli-il-rito",
      ].includes(x.templateKey)
        ? { ...x, dueDate: addDays(TODAY, -10) }
        : x,
    );
    const g = groupTasks(t, TODAY);
    expect(ids(g.adesso).slice(0, 3)).toEqual([
      "scegli-il-rito",
      "scegli-data-e-location",
      "definisci-budget-iniziale",
    ]);
    expect(g.adesso.map((x) => x.id)).not.toContain("lista-invitati-preliminare");
    expect(ids(g.daRecuperare)).toContain("lista-invitati-preliminare");
  });

  it("(c) highlighted without date come first, 'scegli-il-rito' before all (priority 5)", () => {
    const g = groupTasks(tasksFor("unknown", null), TODAY);
    expect(ids(g.adesso)).toEqual([
      "scegli-il-rito",
      "scegli-data-e-location",
      "definisci-budget-iniziale",
      "lista-invitati-preliminare",
    ]);
  });

  it("without reference only the date-independent tasks show (4, or 5 with unknown)", () => {
    const civil = groupTasks(tasksFor("civile", null), TODAY);
    expect(civil.adesso).toHaveLength(3);
    expect(ids(civil.piuAvanti)).toEqual(["decidi-stile-e-priorita"]);
    expect(civil.hidden).toHaveLength(39);
    expect(civil.daRecuperare).toHaveLength(0);
    const unknown = groupTasks(tasksFor("unknown", null), TODAY);
    expect(unknown.adesso.length + unknown.piuAvanti.length).toBe(5);
  });

  it("Da recuperare ties: priority, then oldest due, user tasks last; includes user tasks", () => {
    const g = groupTasks(
      [
        userTask("mine-old", "2026-01-01"),
        userTask("mine-new", "2026-06-01"),
        ...tasksFor("civile", "2027-09-03").filter((t) => t.id === "scegli-catering"),
      ],
      TODAY,
    );
    expect(ids(g.daRecuperare)).toEqual(["scegli-catering", "mine-old", "mine-new"]);
  });

  it("Più avanti: user tasks without date first", () => {
    const g = groupTasks([userTask("later", "2028-01-01"), userTask("nodate", null)], TODAY);
    expect(ids(g.piuAvanti)).toEqual(["nodate", "later"]);
  });

  it("Fatti and deleted", () => {
    const g = groupTasks(
      [
        userTask("done", "2026-01-01", { status: "done" }),
        userTask("gone", "2026-12-01", { deleted: true }),
      ],
      TODAY,
    );
    expect(ids(g.fatti)).toEqual(["done"]);
    expect(ids(g.deleted)).toEqual(["gone"]);
    expect(g.hidden).toHaveLength(0);
    expect(g.adesso).toHaveLength(0);
  });

  it("a generated dependent task whose date was cleared by hand stays visible, as 'senza scadenza'", () => {
    const [t] = tasksFor("civile", null).filter((x) => x.id === "scegli-catering");
    const g = groupTasks([{ ...t!, dueDate: null, dueOverridden: true }], TODAY);
    expect(ids(g.piuAvanti)).toEqual(["scegli-catering"]);
    expect(g.hidden).toHaveLength(0);
  });

  it("an overridden date on a dependent task keeps it visible", () => {
    const [t] = tasksFor("civile", null).filter((x) => x.id === "scegli-catering");
    const g = groupTasks([{ ...t!, dueDate: addDays(TODAY, 5), dueOverridden: true }], TODAY);
    expect(ids(g.adesso)).toEqual(["scegli-catering"]);
  });
});
