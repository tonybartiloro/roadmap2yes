import { describe, expect, it } from "vitest";
import { buildNews, formatShortDate, type NewsInput } from ".";

const people = [
  { userId: "tony", firstName: "Tony" },
  { userId: "jess", firstName: "Jessica" },
];
const base: NewsInput = { viewerId: "tony", since: "2026-11-20T10:00:00Z", people };
const texts = (input: Partial<NewsInput>) => buildNews({ ...base, ...input }).map((n) => n.text);

describe("news (AC41, plan §9)", () => {
  it("is empty on a first visit (the welcome card shows instead)", () => {
    expect(
      texts({
        since: null,
        decisionEvents: [
          {
            id: 1,
            at: "2026-11-21T10:00:00Z",
            kind: "chosen",
            actorId: "jess",
            decisionKey: "location",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("maps decision events to sentences in the viewer's tone", () => {
    expect(
      texts({
        decisionEvents: [
          {
            id: 1,
            at: "2026-11-21T10:00:00Z",
            kind: "chosen",
            actorId: "jess",
            decisionKey: "location",
          },
          {
            id: 2,
            at: "2026-11-22T10:00:00Z",
            kind: "chosen",
            actorId: "jess",
            decisionKey: "date",
          },
          {
            id: 3,
            at: "2026-11-22T11:00:00Z",
            kind: "option_added",
            actorId: "jess",
            decisionKey: "location",
            optionTitle: "Villa Rossi",
          },
          {
            id: 4,
            at: "2026-11-22T12:00:00Z",
            kind: "note",
            actorId: "jess",
            decisionKey: "location",
          },
        ],
      }),
    ).toEqual([
      "Jessica ha aggiunto un'opzione: Villa Rossi",
      "Jessica ha scelto la data",
      "Jessica ha scelto la location",
    ]);
  });

  it("uses only changes after `since` and leaves out the viewer's own actions", () => {
    expect(
      texts({
        decisionEvents: [
          {
            id: 1,
            at: "2026-11-19T10:00:00Z",
            kind: "chosen",
            actorId: "jess",
            decisionKey: "location",
          },
          {
            id: 2,
            at: "2026-11-20T10:00:00Z",
            kind: "chosen",
            actorId: "jess",
            decisionKey: "location",
          },
          {
            id: 3,
            at: "2026-11-21T10:00:00Z",
            kind: "chosen",
            actorId: "tony",
            decisionKey: "date",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("whitelists audit changes: reference date, tasks, budget, payments", () => {
    const at = "2026-11-21T10:00:00Z";
    const audit = [
      {
        id: 1,
        at,
        actorId: "jess",
        tableName: "weddings",
        op: "UPDATE",
        oldData: { applied_reference_date: "2027-09-03" },
        newData: { applied_reference_date: "2027-03-12" },
      },
      {
        id: 2,
        at,
        actorId: "jess",
        tableName: "weddings",
        op: "UPDATE",
        oldData: { applied_reference_date: "2027-09-03", rite: "a" },
        newData: { applied_reference_date: "2027-09-03", rite: "b" },
      },
      {
        id: 3,
        at,
        actorId: "jess",
        tableName: "tasks",
        op: "UPDATE",
        oldData: { status: "todo", title: "Fotografo" },
        newData: { status: "done", title: "Fotografo" },
      },
      {
        id: 4,
        at,
        actorId: "jess",
        tableName: "tasks",
        op: "INSERT",
        newData: { title: "Fedi", source: "user" },
      },
      {
        id: 5,
        at,
        actorId: "jess",
        tableName: "tasks",
        op: "INSERT",
        newData: { title: "Template", source: "template" },
      },
      {
        id: 6,
        at,
        actorId: "jess",
        tableName: "budget_versions",
        op: "INSERT",
        newData: { total_cents: 3_000_000 },
      },
      {
        id: 7,
        at,
        actorId: "jess",
        tableName: "payments",
        op: "UPDATE",
        oldData: { paid: false },
        newData: { paid: true },
      },
      {
        id: 8,
        at,
        actorId: "jess",
        tableName: "invitations",
        op: "UPDATE",
        oldData: {},
        newData: { token_hash: "x" },
      },
      {
        id: 9,
        at,
        actorId: "jess",
        tableName: "weddings",
        op: "UPDATE",
        oldData: { applied_reference_date: "2027-09-03" },
        newData: { applied_reference_date: null },
      },
    ] as const;
    expect(texts({ audit })).toEqual([
      "Jessica ha completato «Fotografo»",
      "Jessica ha aggiunto il compito «Fedi»",
      "Jessica ha impostato il budget a € 30.000",
      "Jessica ha segnato un pagamento come pagato",
    ]);
  });

  it("shows a reference change once, from the decision event, with the date", () => {
    const at = "2026-11-21T10:00:00Z";
    const items = buildNews({
      ...base,
      audit: [
        {
          id: 1,
          at,
          actorId: "jess",
          tableName: "weddings",
          op: "UPDATE",
          oldData: { applied_reference_date: "2027-09-03" },
          newData: { applied_reference_date: "2027-03-12" },
        },
      ],
      decisionEvents: [
        {
          id: 1,
          at,
          kind: "reference_set",
          actorId: "jess",
          decisionKey: "date",
          referenceDate: "2027-03-12",
        },
      ],
    });
    expect(items.map((i) => i.text)).toEqual([
      "Jessica ha impostato il 12 mar 2027 come riferimento per le scadenze",
    ]);
  });

  it("shows system events only with a neutral phrase, never attributed", () => {
    const at = "2026-11-21T10:00:00Z";
    expect(
      texts({
        audit: [
          {
            id: 1,
            at,
            actorId: null,
            tableName: "tasks",
            op: "INSERT",
            newData: { title: "X", source: "user" },
          },
        ],
        decisionEvents: [
          {
            id: 1,
            at,
            kind: "reference_auto",
            actorId: null,
            decisionKey: "date",
            referenceDate: "2027-03-12",
          },
          { id: 2, at, kind: "chosen", actorId: null, decisionKey: "date" },
        ],
      }),
    ).toEqual(["Il riferimento è tornato automatico: ora le scadenze seguono il 12 mar 2027"]);
  });

  it("maps account events, including transparency for a temporary code", () => {
    const at = "2026-11-21T10:00:00Z";
    expect(
      texts({
        accountEvents: [
          { id: 1, at, kind: "temp_code_set", actorId: "jess", targetUserId: "tony" },
          {
            id: 2,
            at: "2026-11-21T11:00:00Z",
            kind: "email_changed",
            actorId: "jess",
            targetUserId: null,
          },
          {
            id: 3,
            at: "2026-11-21T12:00:00Z",
            kind: "code_changed",
            actorId: "jess",
            targetUserId: null,
          },
          {
            id: 4,
            at: "2026-11-21T13:00:00Z",
            kind: "invite_revoked",
            actorId: "jess",
            targetUserId: null,
          },
          {
            id: 5,
            at: "2026-11-21T14:00:00Z",
            kind: "partner_account_created",
            actorId: "jess",
            targetUserId: "tony",
          },
          {
            id: 6,
            at: "2026-11-21T15:00:00Z",
            kind: "temp_code_set",
            actorId: "tony",
            targetUserId: "jess",
          },
        ],
      }),
    ).toEqual([
      "Jessica ha creato il tuo accesso",
      "Jessica ha annullato l'invito",
      "Jessica ha cambiato il proprio codice d'accesso",
      "Jessica ha cambiato la propria email di accesso",
      "Jessica ha impostato un codice temporaneo per te",
    ]);
  });

  it("sorts newest first across sources and honours the limit", () => {
    const items = buildNews({
      ...base,
      limit: 2,
      accountEvents: [
        {
          id: 1,
          at: "2026-11-21T10:00:00Z",
          kind: "code_changed",
          actorId: "jess",
          targetUserId: null,
        },
      ],
      decisionEvents: [
        { id: 1, at: "2026-11-23T10:00:00Z", kind: "chosen", actorId: "jess", decisionKey: "date" },
        {
          id: 2,
          at: "2026-11-22T10:00:00Z",
          kind: "reopened",
          actorId: "jess",
          decisionKey: "location",
        },
      ],
    });
    expect(items.map((i) => i.id)).toEqual(["decision:1", "decision:2"]);
  });

  it("falls back to the label and then to a generic name when a name is missing", () => {
    expect(
      texts({
        people: [{ userId: "jess", label: "Sposa" }],
        decisionEvents: [
          {
            id: 1,
            at: "2026-11-21T10:00:00Z",
            kind: "chosen",
            actorId: "jess",
            decisionKey: "location",
          },
        ],
      }),
    ).toEqual(["Sposa ha scelto la location"]);
    expect(
      texts({
        people: [],
        decisionEvents: [
          { id: 1, at: "2026-11-21T10:00:00Z", kind: "chosen", actorId: "x", decisionKey: "other" },
        ],
      }),
    ).toEqual(["il tuo partner ha fatto una scelta"]);
  });

  it("formats short dates", () => {
    expect(formatShortDate("2027-03-12")).toBe("12 mar 2027");
    expect(formatShortDate("2027-09-03")).toBe("3 set 2027");
  });
});
