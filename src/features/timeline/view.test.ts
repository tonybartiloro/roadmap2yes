import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates/plain-date";
import { generateTasks } from "@/domain/timeline";
import { DEFAULT_FILTERS } from "./filters";
import { ME, PARTNER, makeData, scenario, task, templateTask } from "./test-fixtures";
import { buildPercorsoView } from "./view";

const TODAY = "2026-11-24";
const build = (
  data = makeData(),
  extra: { previewId?: string | null; filters?: typeof DEFAULT_FILTERS } = {},
) =>
  buildPercorsoView({
    data,
    today: TODAY,
    previewId: extra.previewId ?? null,
    filters: extra.filters ?? DEFAULT_FILTERS,
  });
const ids = (rows: readonly { task: { id: string } }[]) => rows.map((r) => r.task.id);

describe("groups and thresholds (AC29, AC30; design §3.4)", () => {
  const at = (days: number) => addDays(TODAY, days);

  it("puts each open task in its phase by days from today (Europe/Rome calendar date)", () => {
    const view = build(
      makeData({
        tasks: [
          task("yesterday", { dueDate: at(-1) }),
          task("today", { dueDate: at(0) }),
          task("plus30", { dueDate: at(30) }),
          task("plus31", { dueDate: at(31) }),
          task("plus90", { dueDate: at(90) }),
          task("plus91", { dueDate: at(91) }),
          task("undated"),
          task("finished", { status: "done", dueDate: at(5) }),
          task("removed", { deleted: true, deletedAt: "2026-11-20T10:00:00Z" }),
        ],
      }),
    );
    expect(ids(view.groups.adesso)).toEqual(["today", "plus30"]);
    expect(ids(view.groups.daRecuperare)).toEqual(["yesterday"]);
    expect(ids(view.groups.prossimi3Mesi)).toEqual(["plus31", "plus90"]);
    expect(ids(view.groups.piuAvanti)).toEqual(["undated", "plus91"]);
    expect(ids(view.groups.fatti)).toEqual(["finished"]);
    expect(view.deleted.map((t) => t.id)).toEqual(["removed"]);
    expect(view.totalLive).toBe(8);
  });

  it("an overdue generated task goes to Da recuperare, never hidden (D15)", () => {
    const view = build(
      makeData({
        tasks: [templateTask("scegli-catering", { dueDate: "2026-10-03" })],
      }),
    );
    expect(ids(view.groups.daRecuperare)).toEqual(["t-scegli-catering"]);
  });

  it("at most 3 overdue highlighted milestones are promoted to Adesso", () => {
    const view = build(
      makeData({
        tasks: [
          templateTask("scegli-data-e-location", { dueDate: "2026-09-01" }),
          templateTask("definisci-budget-iniziale", { dueDate: "2026-09-02" }),
          templateTask("lista-invitati-preliminare", { dueDate: "2026-09-03" }),
          templateTask("scegli-catering", { dueDate: "2026-09-04" }),
        ],
      }),
    );
    expect(view.groups.adesso).toHaveLength(3);
    expect(ids(view.groups.daRecuperare)).toEqual(["t-scegli-catering"]);
  });

  it("Adesso empty: next step is the first future dated task", () => {
    const view = build(
      makeData({
        tasks: [
          task("far", { dueDate: at(100) }),
          task("soon", { dueDate: at(45), title: "Prenotare il fotografo" }),
        ],
      }),
    );
    expect(view.groups.adesso).toHaveLength(0);
    expect(view.nextStep).toEqual({ title: "Prenotare il fotografo", due: at(45) });
  });

  it("with no reference the date-dependent generated tasks are hidden (AC15), the others stay", () => {
    const view = build(
      makeData({
        tasks: [
          templateTask("scegli-catering"),
          templateTask("scegli-data-e-location"),
          task("mine"),
        ],
      }),
    );
    expect(view.reference).toBeNull();
    expect(view.hiddenCount).toBe(1);
    expect(ids(view.groups.adesso)).toEqual(["t-scegli-data-e-location"]);
    expect(ids(view.groups.piuAvanti)).toEqual(["mine"]);
  });
});

describe("reference (AC24, D28)", () => {
  const near = scenario("s-near", "2027-03-12", { label: "Primavera" });
  const far = scenario("s-far", "2027-09-03");

  it("default: the nearest open scenario, provisional, automatic", () => {
    const view = build(makeData({ scenarios: [far, near] }));
    expect(view.reference?.scenario.optionId).toBe("s-near");
    expect(view.reference?.status).toBe("provisional");
    expect(view.reference?.source).toBe("automatic");
    expect(view.pickerAvailable).toBe(true);
  });

  it("a scenario already in the past is not the automatic default", () => {
    const past = scenario("s-past", "2026-10-01");
    const view = build(makeData({ scenarios: [past, far] }));
    expect(view.reference?.scenario.optionId).toBe("s-far");
  });

  it("manual reference: provisional, named after who set it", () => {
    const view = build(
      makeData({
        scenarios: [near, far],
        manualReferenceId: "s-far",
        events: [
          {
            kind: "reference_set",
            optionId: "s-far",
            actorId: PARTNER,
            at: "2026-11-23T10:00:00Z",
          },
        ],
      }),
    );
    expect(view.reference?.scenario.optionId).toBe("s-far");
    expect(view.reference?.source).toBe("manual");
    expect(view.reference?.setByName).toBe("Jessica");
  });

  it("decision taken: the chosen scenario is definitive and the picker disappears", () => {
    const view = build(
      makeData({
        dateDecision: { id: "d-date", status: "taken" },
        scenarios: [
          scenario("s-near", "2027-03-12", { status: "discarded" }),
          scenario("s-far", "2027-09-03", { status: "chosen" }),
        ],
      }),
    );
    expect(view.reference?.status).toBe("definitive");
    expect(view.reference?.scenario.optionId).toBe("s-far");
    expect(view.decisionTaken).toBe(true);
    expect(view.pickerAvailable).toBe(false);
  });

  it("a single scenario is the reference and gets no picker", () => {
    const view = build(makeData({ scenarios: [far] }));
    expect(view.reference?.scenario.optionId).toBe("s-far");
    expect(view.pickerAvailable).toBe(false);
  });

  it("shows the linked location, marked when it was discarded (AC60)", () => {
    const linked = scenario("s-a", "2027-03-12", { locationOptionId: "l-1" });
    const view = build(
      makeData({
        scenarios: [linked, far],
        locations: [{ id: "l-1", title: "Villa Rossi", status: "discarded" }],
      }),
    );
    expect(view.reference?.scenario.locationText).toBe("Villa Rossi (scartata)");
    const open = build(
      makeData({
        scenarios: [linked, far],
        locations: [{ id: "l-1", title: "Villa Rossi", status: "candidate" }],
      }),
    );
    expect(open.reference?.scenario.locationText).toBe("Villa Rossi");
  });

  it("reopened decision: the same scenario stays reference but provisional, banner on (AC20)", () => {
    const view = build(
      makeData({
        scenarios: [near, far],
        manualReferenceId: "s-far",
        events: [
          { kind: "reopened", optionId: "s-far", actorId: ME, at: "2026-11-24T09:00:00Z" },
          { kind: "chosen", optionId: "s-far", actorId: ME, at: "2026-11-22T09:00:00Z" },
        ],
        tasks: [templateTask("scegli-catering", { dueDate: "2026-12-01", needsReview: true })],
      }),
    );
    expect(view.reference?.status).toBe("provisional");
    expect(view.reopened).toBe(true);
    expect(view.reviewCount).toBe(1);
  });

  it("the banner is off while the decision is taken or when it was never reopened", () => {
    const taken = build(
      makeData({
        dateDecision: { id: "d-date", status: "taken" },
        scenarios: [scenario("s-far", "2027-09-03", { status: "chosen" })],
        events: [{ kind: "chosen", optionId: "s-far", actorId: ME, at: "2026-11-22T09:00:00Z" }],
      }),
    );
    expect(taken.reopened).toBe(false);
    expect(build(makeData({ scenarios: [near, far] })).reopened).toBe(false);
  });
});

describe("preview (AC32, DES-28): no writes, reference unchanged", () => {
  const near = scenario("s-near", "2027-03-12");
  const far = scenario("s-far", "2027-09-03");
  const tasks = [
    templateTask("scegli-testimoni", { dueDate: "2026-07-12" }), // 8 months before 2027-03-12
    templateTask("scegli-catering", { dueDate: "2026-04-12", dueOverridden: true }),
    task("mine", { dueDate: "2027-02-01" }),
  ];

  it("recalculates dates of untouched generated tasks only and counts the changes", () => {
    const view = build(makeData({ scenarios: [near, far], tasks }), { previewId: "s-far" });
    expect(view.preview?.scenario.optionId).toBe("s-far");
    expect(view.preview?.changedCount).toBe(1);
    expect(view.reference?.scenario.optionId).toBe("s-near");
    const all = [
      ...view.groups.adesso,
      ...view.groups.daRecuperare,
      ...view.groups.prossimi3Mesi,
      ...view.groups.piuAvanti,
    ];
    const moved = all.find((r) => r.task.id === "t-scegli-testimoni");
    expect(moved?.task.dueDate).toBe("2027-01-03");
    expect(moved?.previousDue).toBe("2026-07-12");
    const overridden = all.find((r) => r.task.id === "t-scegli-catering");
    expect(overridden?.previousDue).toBeNull();
    expect(overridden?.task.dueDate).toBe("2026-04-12");
  });

  it("does not mutate the data it was given", () => {
    const data = makeData({ scenarios: [near, far], tasks });
    const before = JSON.stringify(data);
    build(data, { previewId: "s-far" });
    expect(JSON.stringify(data)).toBe(before);
  });

  it("previewing the reference itself shows no banner and no notice", () => {
    const view = build(makeData({ scenarios: [near, far], tasks }), { previewId: "s-near" });
    expect(view.preview).toBeNull();
    expect(view.previewClosed).toBeNull();
  });

  it("an unknown or removed scenario closes the preview with a notice", () => {
    const view = build(makeData({ scenarios: [near, far], tasks }), { previewId: "gone" });
    expect(view.preview).toBeNull();
    expect(view.previewClosed).toBe("gone");
  });

  it("with the decision taken the preview is closed ('taken')", () => {
    const view = build(
      makeData({
        dateDecision: { id: "d-date", status: "taken" },
        scenarios: [
          scenario("s-near", "2027-03-12", { status: "chosen" }),
          scenario("s-far", "2027-09-03", { status: "discarded" }),
        ],
        tasks,
      }),
      { previewId: "s-far" },
    );
    expect(view.preview).toBeNull();
    expect(view.previewClosed).toBe("taken");
  });

  it("a discarded scenario cannot be previewed", () => {
    const view = build(
      makeData({
        scenarios: [near, far, scenario("s-x", "2028-05-01", { status: "discarded" })],
        tasks,
      }),
      { previewId: "s-x" },
    );
    expect(view.previewClosed).toBe("gone");
  });
});

describe("suggestions (AC16, AC48)", () => {
  const unknownTasks = generateTasks("unknown", "2027-09-03").map((g) =>
    templateTask(g.templateKey, { dueDate: g.dueDate, title: g.title }),
  );

  it("offers new milestones for the rite and the one that no longer applies", () => {
    const view = build(makeData({ rite: "civile", tasks: unknownTasks }));
    expect(view.suggestions.additions.length).toBeGreaterThan(0);
    expect(view.suggestions.removals.map((t) => t.templateKey)).toEqual(["scegli-il-rito"]);
  });

  it("dismissed suggestions and deleted tasks are not offered again", () => {
    const first = build(makeData({ rite: "civile", tasks: unknownTasks }));
    const dismissed = first.suggestions.additions.slice(0, 2).map((m) => ({
      templateKey: m.key,
      kind: "add" as const,
    }));
    const view = build(makeData({ rite: "civile", tasks: unknownTasks, dismissals: dismissed }));
    expect(view.suggestions.additions).toHaveLength(first.suggestions.additions.length - 2);

    const deletedKey = first.suggestions.additions[0]!.key;
    const withDeleted = build(
      makeData({
        rite: "civile",
        tasks: [
          ...unknownTasks,
          templateTask(deletedKey, { deleted: true, deletedAt: "2026-11-01T00:00:00Z" }),
        ],
      }),
    );
    expect(withDeleted.suggestions.additions.map((m) => m.key)).not.toContain(deletedKey);
  });

  it("no rite yet: no suggestions", () => {
    expect(build(makeData({ rite: null, tasks: unknownTasks })).suggestions.additions).toEqual([]);
  });
});

describe("filters and 'Scadenze ricalcolate' (DES-19)", () => {
  it("'Miei' keeps mine and Entrambi, 'di {partner}' keeps theirs and Entrambi", () => {
    const tasks = [
      task("both", { assignee: "both" }),
      task("a", { assignee: "A" }),
      task("b", { assignee: "B" }),
    ];
    const mine = build(makeData({ tasks }), { filters: { ...DEFAULT_FILTERS, assignee: "mine" } });
    expect(ids(mine.groups.piuAvanti).sort()).toEqual(["a", "both"]);
    const theirs = build(makeData({ tasks }), {
      filters: { ...DEFAULT_FILTERS, assignee: "partner" },
    });
    expect(ids(theirs.groups.piuAvanti).sort()).toEqual(["b", "both"]);
    expect(mine.activeFilters).toBe(1);
  });

  it("status, category and due-date filters combine", () => {
    const tasks = [
      task("x", { category: "catering", dueDate: addDays(TODAY, -3) }),
      task("y", { category: "catering", dueDate: addDays(TODAY, 3) }),
      task("z", { category: "musica", dueDate: addDays(TODAY, -3) }),
    ];
    const view = build(makeData({ tasks }), {
      filters: { ...DEFAULT_FILTERS, category: "catering", due: "overdue" },
    });
    expect(ids(view.groups.daRecuperare)).toEqual(["x"]);
    expect(view.shownCount).toBe(1);
    expect(view.activeFilters).toBe(2);
  });

  it("shows the strip only for a partner change after the previous session", () => {
    const base = {
      scenarios: [scenario("s-near", "2027-03-12"), scenario("s-far", "2027-09-03")],
      previousSeenAt: "2026-11-23T08:00:00Z",
    };
    const fromPartner = build(
      makeData({
        ...base,
        events: [
          {
            kind: "option_added",
            optionId: "s-near",
            actorId: PARTNER,
            at: "2026-11-23T20:00:00Z",
          },
        ],
      }),
    );
    expect(fromPartner.recalculated).toEqual({ byName: "Jessica" });

    const mine = build(
      makeData({
        ...base,
        events: [
          { kind: "option_added", optionId: "s-near", actorId: ME, at: "2026-11-23T20:00:00Z" },
        ],
      }),
    );
    expect(mine.recalculated).toBeNull();

    const old = build(
      makeData({
        ...base,
        events: [
          {
            kind: "option_added",
            optionId: "s-near",
            actorId: PARTNER,
            at: "2026-11-20T20:00:00Z",
          },
        ],
      }),
    );
    expect(old.recalculated).toBeNull();

    const firstVisit = build(
      makeData({
        ...base,
        previousSeenAt: null,
        events: [
          {
            kind: "option_added",
            optionId: "s-near",
            actorId: PARTNER,
            at: "2026-11-23T20:00:00Z",
          },
        ],
      }),
    );
    expect(firstVisit.recalculated).toBeNull();
  });
});
