import { describe, expect, it } from "vitest";
import { tasksFor } from "@/domain/timeline/test-helpers";
import type { Tables } from "@/lib/supabase/database.types";
import {
  buildDetailView,
  buildListItems,
  comparisonRows,
  decisionState,
  defaultScenarioTitle,
  describeEvent,
  earlierThanDesired,
  EMPTY_OPTION_FORM,
  formatEventTime,
  linkHost,
  manualSetBy,
  mapDbError,
  nameBook,
  optionToFormValues,
  parseLines,
  parseOptionForm,
  parseScenarioForm,
  type PartnerRow,
  type RawDecisionDetail,
} from "./model";
import type { EventView, OptionView } from "./types";

const ME = "user-tony";
const HER = "user-jessica";
const partners: PartnerRow[] = [
  { user_id: ME, first_name: "Tony", last_name: null, label: "Sposo", slot: "a" },
  { user_id: HER, first_name: "Jessica", last_name: null, label: null, slot: "b" },
];

const stamp = "2026-11-24T10:00:00Z";

function option(
  overrides: Partial<Tables<"decision_options">> & { id: string },
): Tables<"decision_options"> {
  return {
    comune: null,
    cons: [],
    cost_cents: null,
    created_at: stamp,
    created_by: null,
    decision_id: "d-date",
    deleted_at: null,
    deleted_by: null,
    link: null,
    notes: null,
    pros: [],
    status: "candidate",
    title: overrides.id,
    updated_at: stamp,
    updated_by: null,
    version: 1,
    wedding_id: "w",
    ...overrides,
  };
}

function scenario(
  optionId: string,
  dateFrom: string,
  extra: Partial<Tables<"date_scenarios">> = {},
): Tables<"date_scenarios"> {
  return {
    created_at: stamp,
    created_by: null,
    date_from: dateFrom,
    date_to: null,
    id: `sc-${optionId}`,
    kind: "fixed",
    location_option_id: null,
    option_id: optionId,
    updated_at: stamp,
    updated_by: null,
    version: 1,
    wedding_id: "w",
    ...extra,
  };
}

function decision(overrides: Partial<Tables<"decisions">> = {}): Tables<"decisions"> {
  return {
    chosen_at: null,
    chosen_by: null,
    chosen_option_id: null,
    created_at: stamp,
    created_by: null,
    id: "d-date",
    key: "date",
    question: "Quando vi sposate?",
    status: "open",
    type: "date",
    updated_at: stamp,
    updated_by: null,
    version: 3,
    wedding_id: "w",
    ...overrides,
  };
}

function event(
  id: number,
  kind: string,
  extra: Partial<Tables<"decision_events">> = {},
): Tables<"decision_events"> {
  return {
    actor_id: ME,
    at: `2026-11-24T10:0${id}:00Z`,
    decision_id: "d-date",
    id,
    kind,
    option_id: null,
    payload: {},
    reason: null,
    wedding_id: "w",
    ...extra,
  };
}

function raw(overrides: Partial<RawDecisionDetail> = {}): RawDecisionDetail {
  return {
    decision: decision(),
    options: [option({ id: "a" }), option({ id: "b" })],
    scenarios: [scenario("a", "2027-09-03"), scenario("b", "2028-05-14")],
    reactions: [],
    events: [],
    partners,
    manualReferenceId: null,
    locationOptions: [],
    tasks: [],
    meUserId: ME,
    today: "2026-11-24",
    ...overrides,
  };
}

describe("mapDbError", () => {
  it("maps the T8 business codes to Italian", () => {
    expect(mapDbError({ code: "P0001", message: "reason_required" }).code).toBe("reason_required");
    expect(mapDbError({ code: "P0001", message: "exact_date_required" }).message).toMatch(
      /giorno esatto/,
    );
    expect(mapDbError({ code: "P0001", message: "decision_taken" }).message).toMatch(/riaprila/);
  });
  it("names the partner in a version conflict", () => {
    expect(mapDbError({ code: "P0001", message: "version_conflict" }, "Jessica").message).toMatch(
      /^Jessica /,
    );
  });
  it("maps 42501 to forbidden and anything else to a generic message", () => {
    expect(mapDbError({ code: "42501", message: "forbidden" }).code).toBe("forbidden");
    expect(mapDbError({ code: "23514", message: "check violation" }).code).toBe("unknown");
    expect(mapDbError(null).code).toBe("unknown");
  });
});

describe("parseLines / parseOptionForm", () => {
  it("splits one entry per line and drops blanks", () => {
    expect(parseLines(" bello \n\n  comodo\r\n")).toEqual(["bello", "comodo"]);
  });

  it("requires a name and validates link and amount", () => {
    const result = parseOptionForm({ ...EMPTY_OPTION_FORM, link: "ftp://x", costText: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.title).toBeDefined();
      expect(result.errors.link).toBeDefined();
      expect(result.errors.costText).toBeDefined();
    }
  });

  it("parses a complete location", () => {
    const result = parseOptionForm({
      title: " Mamma Rosa ",
      comune: "Lucca",
      link: "https://mammarosa.example.test/",
      notes: "",
      prosText: "Giardino\nParcheggio",
      consText: "Lontana",
      costText: "1.500,50",
    });
    expect(result).toEqual({
      ok: true,
      input: {
        title: "Mamma Rosa",
        comune: "Lucca",
        link: "https://mammarosa.example.test/",
        notes: null,
        pros: ["Giardino", "Parcheggio"],
        cons: ["Lontana"],
        costCents: 150050,
      },
    });
  });

  it("caps pros at 20 lines", () => {
    const prosText = Array.from({ length: 21 }, (_, i) => `p${i}`).join("\n");
    const result = parseOptionForm({ ...EMPTY_OPTION_FORM, title: "x", prosText });
    expect(result.ok).toBe(false);
  });

  it("round-trips cost through the form values without grouping", () => {
    const view = {
      costCents: 150050,
      pros: [],
      cons: [],
      title: "t",
      comune: null,
      link: null,
      notes: null,
    } as unknown as OptionView;
    expect(optionToFormValues(view).costText).toBe("1500,50");
  });
});

describe("parseScenarioForm", () => {
  it("asks for a date when fixed", () => {
    const result = parseScenarioForm({
      kind: "fixed",
      date: "",
      from: null,
      to: null,
      locationId: "",
    });
    expect(result).toEqual({ ok: false, errors: { date: "Scegli una data." } });
  });

  it("fixed date with a linked location", () => {
    const result = parseScenarioForm({
      kind: "fixed",
      date: "2028-05-14",
      from: null,
      to: null,
      locationId: "loc-1",
    });
    expect(result).toEqual({
      ok: true,
      input: { kind: "fixed", dateFrom: "2028-05-14", dateTo: null, locationOptionId: "loc-1" },
    });
  });

  it("a period runs from the first day of the first month to the last day of the last", () => {
    const result = parseScenarioForm({
      kind: "period",
      date: "",
      from: { year: 2028, month: 5 },
      to: { year: 2028, month: 6 },
      locationId: "",
    });
    expect(result).toEqual({
      ok: true,
      input: {
        kind: "period",
        dateFrom: "2028-05-01",
        dateTo: "2028-06-30",
        locationOptionId: null,
      },
    });
  });

  it("refuses an end before the start", () => {
    const result = parseScenarioForm({
      kind: "period",
      date: "",
      from: { year: 2028, month: 6 },
      to: { year: 2028, month: 5 },
      locationId: "",
    });
    expect(result.ok).toBe(false);
  });

  it("titles a blank label from the date or the period", () => {
    expect(
      defaultScenarioTitle({
        kind: "fixed",
        dateFrom: "2028-05-14",
        dateTo: null,
        locationOptionId: null,
      }),
    ).toBe("14 maggio 2028");
    expect(
      defaultScenarioTitle({
        kind: "period",
        dateFrom: "2028-05-01",
        dateTo: "2028-06-30",
        locationOptionId: null,
      }),
    ).toBe("mag–giu 2028");
  });

  it("warns (never blocks) for a date before 3 Sep 2027", () => {
    expect(earlierThanDesired("2027-09-02")).toBe(true);
    expect(earlierThanDesired("2027-09-03")).toBe(false);
    expect(earlierThanDesired("")).toBe(false);
  });
});

describe("decisionState", () => {
  it("is taken, open or review (reopened after being taken)", () => {
    expect(decisionState("taken", [])).toBe("taken");
    expect(decisionState("open", [])).toBe("open");
    expect(
      decisionState("open", [
        { id: 1, kind: "chosen" },
        { id: 2, kind: "reopened" },
      ]),
    ).toBe("review");
    expect(
      decisionState("open", [
        { id: 1, kind: "reopened" },
        { id: 2, kind: "chosen" },
      ]),
    ).toBe("open");
  });
});

describe("buildDetailView: reference (AC24, D28)", () => {
  it("defaults to the nearest open scenario, provisional", () => {
    const view = buildDetailView(raw());
    expect(view.reference).toMatchObject({
      optionId: "a",
      status: "provisional",
      source: "automatic",
    });
  });

  it("uses the manual reference and says who set it", () => {
    const view = buildDetailView(
      raw({
        manualReferenceId: "b",
        events: [
          event(1, "reference_set", {
            option_id: "b",
            actor_id: HER,
            payload: { reference_date: "2028-05-14" },
          }),
        ],
      }),
    );
    expect(view.reference).toMatchObject({ optionId: "b", source: "manual", setByName: "Jessica" });
  });

  it("after a reopening the previous scenario stays the reference, provisional, with no 'scelto da'", () => {
    const view = buildDetailView(
      raw({
        manualReferenceId: "b",
        events: [
          event(1, "reference_set", { option_id: "b", actor_id: HER }),
          event(2, "chosen", { option_id: "b" }),
          event(3, "reopened", { option_id: "b", reason: "ripensiamo" }),
        ],
      }),
    );
    expect(view.reference).toMatchObject({ optionId: "b", status: "provisional", setByName: null });
    expect(view.state).toBe("review");
  });

  it("a taken decision makes the chosen scenario definitive", () => {
    const view = buildDetailView(
      raw({
        decision: decision({
          status: "taken",
          chosen_option_id: "b",
          chosen_by: HER,
          chosen_at: stamp,
        }),
        options: [option({ id: "a", status: "discarded" }), option({ id: "b", status: "chosen" })],
      }),
    );
    expect(view.reference).toMatchObject({ optionId: "b", status: "definitive", source: "chosen" });
    expect(view.chosenByName).toBe("Jessica");
    expect(view.options.map((o) => o.id)).toEqual(["b", "a"]);
    expect(view.changedCounts).toEqual({});
  });

  it("counts the deadlines that change per candidate, relative to the current dates", () => {
    const tasks = tasksFor("civile", "2027-09-03");
    const view = buildDetailView(raw({ tasks }));
    expect(view.changedCounts["a"]).toBe(0);
    expect(view.changedCounts["b"]).toBeGreaterThan(0);
  });

  it("ignores deleted options and shows the linked location name on the scenario", () => {
    const view = buildDetailView(
      raw({
        options: [option({ id: "a" }), option({ id: "b", deleted_at: stamp })],
        scenarios: [
          scenario("a", "2027-09-03", { location_option_id: "loc" }),
          scenario("b", "2028-05-14"),
        ],
        locationOptions: [
          { id: "loc", title: "Mamma Rosa", status: "candidate", deleted_at: null },
          { id: "gone", title: "Vecchia", status: "candidate", deleted_at: stamp },
        ],
      }),
    );
    expect(view.options.map((o) => o.id)).toEqual(["a"]);
    expect(view.options[0]!.scenario?.locationName).toBe("Mamma Rosa");
    expect(view.locationChoices).toEqual([{ id: "loc", title: "Mamma Rosa" }]);
  });

  it("shows both partners' reactions, flagging mine", () => {
    const view = buildDetailView(
      raw({
        reactions: [
          {
            id: "r1",
            option_id: "a",
            user_id: ME,
            reaction: "prefer",
            wedding_id: "w",
            version: 1,
            created_at: stamp,
            created_by: ME,
            updated_at: stamp,
            updated_by: ME,
          },
          {
            id: "r2",
            option_id: "a",
            user_id: HER,
            reaction: "doubt",
            wedding_id: "w",
            version: 1,
            created_at: stamp,
            created_by: HER,
            updated_at: stamp,
            updated_by: HER,
          },
        ],
      }),
    );
    expect(view.options[0]!.reactions).toEqual([
      { userId: ME, name: "Tony", reaction: "prefer", mine: true },
      { userId: HER, name: "Jessica", reaction: "doubt", mine: false },
    ]);
    expect(view.partnerName).toBe("Jessica");
  });

  it("a location decision has no reference", () => {
    const view = buildDetailView(
      raw({ decision: decision({ type: "location", key: "location" }), scenarios: [] }),
    );
    expect(view.reference).toBeNull();
    expect(view.changedCounts).toEqual({});
  });
});

describe("history text (AC21, design §3.8)", () => {
  const ev = (kind: EventView["kind"], extra: Partial<EventView> = {}): EventView => ({
    id: 1,
    kind,
    at: stamp,
    actorName: "Tony",
    optionId: "a",
    optionTitle: "Mamma Rosa",
    reason: null,
    payload: {},
    ...extra,
  });

  it("reference events", () => {
    expect(
      describeEvent(
        ev("reference_set", { payload: { reference_date: "2028-05-14", kind: "fixed" } }),
      ).text,
    ).toBe("Tony ha impostato il 14 mag 2028 come riferimento provvisorio");
    expect(describeEvent(ev("reference_auto")).text).toBe(
      "Tony è tornato al riferimento automatico",
    );
  });

  it("a period reference says it is computed from the first day", () => {
    const text = describeEvent(
      ev("reference_set", { payload: { reference_date: "2028-05-01", kind: "period" } }),
    );
    expect(text.detail).toBe("Scadenze calcolate dal 1 mag");
  });

  it("a choice among periods keeps the period in the history (D33)", () => {
    const text = describeEvent(
      ev("chosen", {
        payload: {
          exact_date: "2028-05-20",
          period: { kind: "period", date_from: "2028-05-01", date_to: "2028-06-30" },
        },
      }),
    );
    expect(text.text).toBe("Tony ha scelto «Mamma Rosa»");
    expect(text.detail).toBe("Giorno scelto: 20 mag 2028, dentro il periodo mag–giu 2028");
  });

  it("reopening carries the reason; a note carries its text", () => {
    expect(describeEvent(ev("reopened", { reason: "Il padrone ha cambiato idea" })).quote).toBe(
      "Il padrone ha cambiato idea",
    );
    expect(
      describeEvent(ev("note", { optionId: null, optionTitle: null, reason: "Chiamare lunedì" })),
    ).toMatchObject({
      text: "Tony ha scritto una nota",
      quote: "Chiamare lunedì",
    });
  });

  it("an edit lists the changed fields in words", () => {
    expect(
      describeEvent(ev("option_updated", { payload: { fields: ["title", "cost_cents"] } })).detail,
    ).toBe("Cambiato: nome, costo indicativo");
  });

  it("manualSetBy only counts while nothing else touched the reference", () => {
    const set = ev("reference_set", { id: 1, actorName: "Jessica" });
    expect(manualSetBy([set], "a")).toBe("Jessica");
    expect(manualSetBy([set, ev("reopened", { id: 2 })], "a")).toBeNull();
    expect(manualSetBy([set], "other")).toBeNull();
  });

  it("formats the time in Europe/Rome", () => {
    expect(formatEventTime("2026-11-24T13:30:00Z")).toMatch(/24 nov 2026,? 14:30/);
  });
});

describe("buildListItems", () => {
  it("lists date first, then location, with state and chosen text", () => {
    const items = buildListItems({
      decisions: [
        decision({
          id: "d-loc",
          key: "location",
          type: "location",
          question: "Dove?",
          created_at: "2026-11-24T09:00:00Z",
        }),
        decision({ status: "taken", chosen_option_id: "b" }),
      ],
      options: [
        { id: "a", decision_id: "d-date", title: "A", deleted_at: null },
        { id: "b", decision_id: "d-date", title: "B", deleted_at: null },
        { id: "l1", decision_id: "d-loc", title: "L1", deleted_at: null },
        { id: "l2", decision_id: "d-loc", title: "L2", deleted_at: stamp },
      ],
      scenarios: [{ option_id: "b", kind: "fixed", date_from: "2028-05-14", date_to: null }],
      events: [],
    });
    expect(items.map((i) => i.key)).toEqual(["date", "location"]);
    expect(items[0]).toMatchObject({ state: "taken", chosenText: "14 mag 2028", optionCount: 2 });
    expect(items[1]).toMatchObject({ state: "open", chosenText: null, optionCount: 1 });
  });
});

describe("comparisonRows (AC17)", () => {
  const base: OptionView = {
    id: "a",
    title: "A",
    comune: "Lucca",
    link: "https://a.example.test/x",
    notes: null,
    pros: ["Giardino"],
    cons: [],
    costCents: 500000,
    status: "candidate",
    version: 1,
    scenario: null,
    reactions: [],
  };

  it("gives the same rows for both, with pros and cons as lists and 'empty' where missing", () => {
    const rows = comparisonRows(
      base,
      { ...base, id: "b", title: "B", comune: null, pros: [], cons: ["Caro"] },
      "location",
      null,
    );
    expect(rows.map((r) => r.label)).toEqual([
      "Comune",
      "Costo indicativo",
      "Link",
      "Pro",
      "Contro",
      "Note",
      "Reazioni",
    ]);
    expect(rows[0]!.cells).toEqual([{ kind: "text", text: "Lucca" }, { kind: "empty" }]);
    expect(rows[1]!.cells[0]).toEqual({ kind: "text", text: "€ 5.000" });
    expect(rows[3]!.cells).toEqual([
      { kind: "list", tone: "pro", items: ["Giardino"] },
      { kind: "empty" },
    ]);
    expect(rows[4]!.cells[1]).toEqual({ kind: "list", tone: "con", items: ["Caro"] });
  });

  it("shows the linked location in the date rows (AC60)", () => {
    const dateOption = (id: string, location: string | null): OptionView => ({
      ...base,
      id,
      scenario: {
        id: `sc-${id}`,
        kind: "fixed",
        dateFrom: "2028-05-14",
        dateTo: null,
        locationOptionId: location ? "loc" : null,
        locationName: location,
        version: 1,
      },
    });
    const rows = comparisonRows(dateOption("a", "Mamma Rosa"), dateOption("b", null), "date", null);
    const location = rows.find((r) => r.label === "Location collegata")!;
    expect(location.cells).toEqual([{ kind: "text", text: "Mamma Rosa" }, { kind: "empty" }]);
  });

  it("only http(s) links are links", () => {
    expect(linkHost("https://a.example.test/x")).toBe("a.example.test");
    expect(linkHost("javascript:alert(1)")).toBeNull();
    expect(linkHost("nota url")).toBeNull();
  });
});

describe("nameBook", () => {
  it("falls back to the label then to 'il tuo partner'", () => {
    const book = nameBook(
      [
        { user_id: ME, first_name: null, last_name: null, label: "Sposo", slot: "a" },
        { user_id: null, first_name: null, last_name: null, label: null, slot: "b" },
      ],
      ME,
    );
    expect(book.me).toBe("Sposo");
    expect(book.partner).toBe("il tuo partner");
    expect(book.nameOf(null)).toBe("Il sistema");
  });
});
