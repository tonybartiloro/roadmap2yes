import { describe, expect, it } from "vitest";
import { parseGuestsCsv } from "@/domain/guests/csv-import";
import {
  CSV_BOM,
  buildExport,
  csvCell,
  exportFileNames,
  lastExport,
  sanitize,
  toCsv,
  type ExportInput,
} from ".";

const input: ExportInput = {
  wedding: { id: "w1", rite: "civile", birth_date: "1990-01-01" },
  partners: [
    { slot: "A", first_name: "Tony", birthDate: "1990-01-01", email: "tony@example.test" },
    { slot: "B", first_name: "Jessica", user_id: "u2" },
  ],
  decisions: [{ id: "d1", key: "location" }],
  decisionOptions: [
    { id: "o1", title: "Villa Rossi" },
    { id: "o2", title: "Masseria Blu", deleted: true, status: "discarded" },
    { id: "o3", title: "3 set 2027" },
  ],
  decisionEvents: [{ id: "e1", kind: "chosen", payload: { token_hash: "abc", note: "ok" } }],
  dateScenarios: [
    {
      id: "s1",
      optionId: "o3",
      kind: "fixed",
      dateFrom: "2027-09-03",
      dateTo: null,
      locationOptionId: "o1",
    },
    {
      id: "s2",
      optionId: "o3",
      kind: "period",
      dateFrom: "2028-05-01",
      dateTo: "2028-06-30",
      locationOptionId: null,
    },
    {
      id: "s3",
      optionId: "o3",
      kind: "fixed",
      dateFrom: "2028-09-02",
      dateTo: null,
      locationOptionId: "o2",
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "Prenota il fotografo",
      category: "foto-video",
      dueDate: "2027-01-10",
      status: "todo",
      assigneeLabel: "Entrambi",
      notes: 'Chiedi; sconto "2 giorni"',
    },
    { id: "t2", title: "=SOMMA(A1)", dueDate: null, status: "done" },
    { id: "t3", title: "Cancellato", dueDate: null, status: "todo", deleted: true },
  ],
  budgetVersions: [{ id: "v1", totalCents: 3_000_000, createdAt: "2026-11-10T10:00:00Z" }],
  budgetCategories: [{ id: "c1", name: "Catering", assignedCents: 1_000_000 }],
  budgetItems: [
    {
      id: "i1",
      categoryId: "c1",
      description: "Menu",
      status: "agreed",
      plannedCents: 900_000,
      agreedCents: 1_120_050,
    },
    {
      id: "i2",
      categoryId: "c1",
      description: "Torta",
      status: "planned",
      plannedCents: 15_050,
      agreedCents: null,
    },
  ],
  payments: [
    {
      id: "p1",
      itemId: "i1",
      kind: "deposit",
      amountCents: 300_000,
      dueDate: "2026-12-01",
      paid: true,
    },
    {
      id: "p2",
      itemId: "i1",
      kind: "balance",
      amountCents: 820_050,
      dueDate: "2027-05-01",
      paid: false,
    },
  ],
  guests: [
    {
      id: "g1",
      firstName: "Anna",
      lastName: "Prova",
      category: "adult",
      side: "A",
      phone: "+39 333 1234567",
      email: "anna@example.test",
      notes: "=cmd",
      groupId: "gr1",
      tableId: "t1",
      deleted: false,
      deletedAt: null,
    },
    {
      id: "g2",
      firstName: "Bruno",
      lastName: null,
      category: "child",
      side: "both",
      phone: null,
      email: null,
      notes: null,
      groupId: "gr2",
      tableId: null,
      deleted: false,
      deletedAt: null,
    },
    {
      id: "g3",
      firstName: "Eliminato",
      lastName: "Finto",
      category: "adult",
      side: null,
      phone: null,
      email: null,
      notes: null,
      groupId: null,
      tableId: null,
      deleted: true,
      deletedAt: "2026-11-20T10:00:00Z",
    },
  ],
  guestGroups: [
    { id: "gr1", name: "Famiglia Prova", deleted: false, deletedAt: null },
    { id: "gr2", name: "Gruppo eliminato", deleted: true, deletedAt: "2026-11-21T10:00:00Z" },
  ],
  guestTables: [
    { id: "t1", name: "Rosa", capacity: 8, deleted: false, deletedAt: null },
    { id: "t2", name: "Vecchio", capacity: null, deleted: true, deletedAt: "2026-11-21T10:00:00Z" },
  ],
};

const now = new Date("2026-11-24T23:30:00Z"); // already 25 Nov in Rome

describe("export (AC42, AC60, plan §10)", () => {
  const bundle = buildExport(input, now);
  const json = JSON.parse(bundle.json);

  it("names the four files with the Rome date", () => {
    expect(bundle.fileNames).toEqual({
      json: "roadmap2yes-2026-11-25.json",
      tasksCsv: "roadmap2yes-compiti-2026-11-25.csv",
      budgetCsv: "roadmap2yes-budget-2026-11-25.csv",
      guestsCsv: "roadmap2yes-invitati-2026-11-25.csv",
    });
    expect(exportFileNames("2027-01-02").json).toBe("roadmap2yes-2027-01-02.json");
  });

  it("has schemaVersion 1 and every section", () => {
    expect(json.schemaVersion).toBe(1);
    expect(json.exportedAt).toBe("2026-11-24T23:30:00.000Z");
    expect(Object.keys(json)).toEqual(
      expect.arrayContaining([
        "wedding",
        "partners",
        "decisions",
        "decisionOptions",
        "decisionEvents",
        "dateScenarios",
        "tasks",
        "budget",
        "guests",
        "guestGroups",
        "guestTables",
      ]),
    );
    expect(Object.keys(json.budget)).toEqual(["versions", "categories", "items", "payments"]);
    expect(json.tasks).toHaveLength(3);
  });

  it("never contains birth dates, token hashes or codes", () => {
    expect(bundle.json).not.toMatch(/birth|token_hash|1990-01-01/i);
    expect(json.decisionEvents[0].payload).toEqual({ note: "ok" });
    expect(
      sanitize({ a: { password: "x", code: "y", keep: [{ accessCode: "z", k: 1 }] } }),
    ).toEqual({
      a: { keep: [{ k: 1 }] },
    });
  });

  it("includes the linked location of every date scenario", () => {
    expect(json.dateScenarios[0].locationOption).toEqual({
      id: "o1",
      title: "Villa Rossi",
      status: null,
      deleted: false,
    });
    expect(json.dateScenarios[1].locationOption).toBeNull();
    expect(json.dateScenarios[2].locationOption).toMatchObject({
      title: "Masseria Blu",
      deleted: true,
      status: "discarded",
    });
  });

  it("writes compiti.csv with BOM, semicolons, CRLF, quoting and no formula injection", () => {
    const lines = bundle.tasksCsv.split("\r\n");
    expect(bundle.tasksCsv.startsWith(CSV_BOM)).toBe(true);
    expect(lines[0]).toBe(`${CSV_BOM}Titolo;Categoria;Scadenza;Stato;Chi se ne occupa;Note`);
    expect(lines[1]).toBe(
      'Prenota il fotografo;Foto e video;2027-01-10;Da fare;Entrambi;"Chiedi; sconto ""2 giorni"""',
    );
    expect(lines[2]).toBe("'=SOMMA(A1);;;Fatto;;");
    expect(lines).toHaveLength(4); // header, 2 tasks (deleted skipped), trailing newline
    expect(lines[3]).toBe("");
  });

  it("writes budget.csv in plain decimal comma amounts", () => {
    const lines = bundle.budgetCsv.split("\r\n");
    expect(lines[0]).toBe(
      `${CSV_BOM}Categoria;Voce;Stato;Assegnato;Previsto;Concordato;Pagato;Ancora da pagare`,
    );
    expect(lines[1]).toBe("Catering;Menu;Concordato;;9000,00;11200,50;3000,00;8200,50");
    expect(lines[2]).toBe("Catering;Torta;Previsto;;150,50;;0,00;");
    expect(lines[3]).toBe("Catering;(assegnato);;10000,00;;;;");
  });
});

describe("guests CSV of the full export, read back by the import (AC21, REV-38)", () => {
  const person = (id: string, side: "A" | "B" | "both" | null) => ({
    ...input.guests[0]!,
    id,
    firstName: `Prova${id}`,
    lastName: null,
    side,
    groupId: null,
    tableId: null,
    phone: null,
    email: null,
    notes: null,
  });
  const guests = [person("1", "A"), person("2", "B"), person("3", "both"), person("4", null)];

  /**
   * Partner rows as the export carries them. The import gets what the Invitati page gives it
   * (`partnerNames().real`: first name, else label, `null` when unset), written here on its own so
   * a different rule inside `guestsCsvOf` is caught (REV-45).
   */
  function roundTrip(partners: ExportInput["partners"]) {
    const real = (slot: string): string | null => {
      const row = partners.find((p) => p["slot"] === slot);
      const first = typeof row?.["first_name"] === "string" ? row["first_name"].trim() : "";
      const label = typeof row?.["label"] === "string" ? row["label"].trim() : "";
      return first || label || null;
    };
    const { guestsCsv } = buildExport({ ...input, partners, guests }, now);
    const preview = parseGuestsCsv(guestsCsv, {
      partners: { a: real("A"), b: real("B") },
      groups: [],
      guests: [],
    });
    if (!preview.ok) throw new Error(preview.code);
    expect(preview.invalid).toBe(0);
    return { guestsCsv, sides: preview.rows.map((row) => row.guest?.side) };
  }

  it("a partner without a first name: the side comes back as the same A/B", () => {
    const { guestsCsv, sides } = roundTrip([
      { slot: "A", first_name: null, label: null },
      { slot: "B", first_name: "Jessica" },
    ]);
    expect(guestsCsv).not.toContain("Partner A"); // never the fallback text
    expect(sides).toEqual(["A", "B", "both", null]);
  });

  it("no partner has a name: letters in the file, same A/B back", () => {
    const { guestsCsv, sides } = roundTrip([{ slot: "A" }, { slot: "B", label: " " }]);
    expect(guestsCsv).not.toContain("Partner");
    expect(sides).toEqual(["A", "B", "both", null]);
  });

  it("both partners with the same name: letters are written and read back exactly", () => {
    const { guestsCsv, sides } = roundTrip([
      { slot: "A", first_name: "Alex" },
      { slot: "B", first_name: "Alex" },
    ]);
    expect(guestsCsv).not.toContain("Alex");
    expect(sides).toEqual(["A", "B", "both", null]);
  });
});

describe("guests in the export (AC21, AC22)", () => {
  const bundle = buildExport(input, now);
  const json = JSON.parse(bundle.json);

  it("the JSON has guests, groups and tables, with the deleted ones marked", () => {
    expect(json.guests.map((g: { id: string; deleted: boolean }) => [g.id, g.deleted])).toEqual([
      ["g1", false],
      ["g2", false],
      ["g3", true],
    ]);
    expect(json.guests[0]).toMatchObject({
      firstName: "Anna",
      side: "A",
      phone: "+39 333 1234567",
    });
    expect(json.guestGroups[1]).toMatchObject({ id: "gr2", deleted: true });
    expect(json.guestTables[1]).toMatchObject({ id: "t2", deleted: true });
  });

  it("the CSV has the live guests only, with the partner's name as side and no formula injection", () => {
    const lines = bundle.guestsCsv.split("\r\n");
    expect(lines[0]).toBe(`${CSV_BOM}nome;cognome;tipo;lato;gruppo;telefono;email;note`);
    // Bruno is in a deleted group: written without group; Eliminato is not there at all
    // the leading + of the phone is neutralised like any formula start (the import removes it)
    expect(lines[1]).toBe(
      "Anna;Prova;adulto;Tony;Famiglia Prova;'+39 333 1234567;anna@example.test;'=cmd",
    );
    expect(lines[2]).toBe("Bruno;;bambino;entrambi;;;;");
    expect(lines).toHaveLength(4);
    expect(bundle.guestsCsv).not.toContain("Eliminato");
  });

  it("an export without guests has empty sections and a header-only CSV", () => {
    const empty = buildExport({ ...input, guests: [], guestGroups: [], guestTables: [] }, now);
    expect(JSON.parse(empty.json).guests).toEqual([]);
    expect(empty.guestsCsv.split("\r\n")).toEqual([
      `${CSV_BOM}nome;cognome;tipo;lato;gruppo;telefono;email;note`,
      "",
    ]);
  });
});

describe("budget.csv consistency with the app totals", () => {
  it("counts Pagato like the totals (agreed items only) and skips deleted categories", () => {
    const csv = buildExport(
      {
        ...input,
        budgetCategories: [
          ...input.budgetCategories,
          { id: "c9", name: "Vecchia", assignedCents: 5, deleted: true },
        ],
        budgetItems: [
          ...input.budgetItems,
          {
            id: "i9",
            categoryId: "c1",
            description: "Annullata",
            status: "cancelled",
            plannedCents: 1,
            agreedCents: null,
          },
          {
            id: "i8",
            categoryId: "c9",
            description: "Orfana",
            status: "planned",
            plannedCents: 1,
            agreedCents: null,
          },
        ],
        payments: [
          ...input.payments,
          { id: "p9", itemId: "i9", kind: "other", amountCents: 700, dueDate: null, paid: true },
        ],
      },
      now,
    ).budgetCsv;
    expect(csv).toContain("Catering;Annullata;Annullata;;0,01;;0,00;");
    expect(csv).not.toContain("Orfana");
    expect(csv).not.toContain("Vecchia");
  });
});

describe("csv helpers", () => {
  it("quotes only when needed and keeps numbers raw", () => {
    expect(csvCell("a")).toBe("a");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("riga\nnuova")).toBe('"riga\nnuova"');
    expect(csvCell(12)).toBe("12");
    expect(csvCell(null)).toBe("");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(toCsv(["a"], [])).toBe(`${CSV_BOM}a\r\n`);
  });
});

describe("lastExport (AC42)", () => {
  it("counts days and reminds after 30", () => {
    expect(lastExport(null, "2026-11-24")).toMatchObject({ days: null, reminder: true });
    expect(lastExport("2026-11-24T08:00:00Z", "2026-11-24")).toEqual({
      days: 0,
      label: "ultimo export: oggi",
      reminder: false,
    });
    expect(lastExport("2026-11-23T08:00:00Z", "2026-11-24").label).toBe(
      "ultimo export: 1 giorno fa",
    );
    expect(lastExport("2026-11-10T08:00:00Z", "2026-11-24").label).toBe(
      "ultimo export: 14 giorni fa",
    );
    expect(lastExport("2026-10-25T08:00:00Z", "2026-11-24")).toMatchObject({
      days: 30,
      reminder: true,
    });
    expect(lastExport("2026-10-26T08:00:00Z", "2026-11-24")).toMatchObject({
      days: 29,
      reminder: false,
    });
  });
});
