import { describe, expect, it } from "vitest";
import { CSV_BOM } from "../export/csv";
import { guestsToCsv, usableSideNames } from "./csv-export";
import type { Guest, GuestGroup } from "./types";

// Invented people only.
const guest = (over: Partial<Guest> & { id: string; firstName: string }): Guest => ({
  lastName: null,
  category: "adult",
  side: null,
  phone: null,
  email: null,
  notes: null,
  groupId: null,
  tableId: null,
  deletedAt: null,
  ...over,
});
const groups: GuestGroup[] = [
  { id: "g1", name: "Famiglia Rossi", deletedAt: null },
  { id: "g2", name: "Gruppo eliminato", deletedAt: "2026-01-01T00:00:00Z" },
];
const lines = (csv: string) => csv.replace(CSV_BOM, "").split("\r\n");

describe("guestsToCsv", () => {
  it("writes BOM, CRLF, `;` and the import's columns", () => {
    const csv = guestsToCsv([], [], { a: "Marco", b: "Anna" });
    expect(csv).toBe(`${CSV_BOM}nome;cognome;tipo;lato;gruppo;telefono;email;note\r\n`);
  });

  it("exports ALL live guests and never the deleted ones", () => {
    const csv = guestsToCsv(
      [
        guest({ id: "1", firstName: "Mario", lastName: "Rossi", groupId: "g1" }),
        guest({ id: "2", firstName: "Eliminato", deletedAt: "2026-01-01T00:00:00Z" }),
        guest({ id: "3", firstName: "Lucia", category: "infant", side: "both" }),
      ],
      groups,
      { a: "Marco", b: "Anna" },
    );
    expect(lines(csv)).toEqual([
      "nome;cognome;tipo;lato;gruppo;telefono;email;note",
      "Mario;Rossi;adulto;;Famiglia Rossi;;;",
      "Lucia;;neonato;entrambi;;;;",
      "",
    ]);
  });

  it("writes the partner's name for A and B, and nothing for 'Non indicato'", () => {
    const csv = guestsToCsv(
      [
        guest({ id: "1", firstName: "Uno", side: "A" }),
        guest({ id: "2", firstName: "Due", side: "B" }),
        guest({ id: "3", firstName: "Tre", side: null }),
      ],
      [],
      { a: " Marco ", b: "Anna" },
    );
    expect(lines(csv).slice(1, 4)).toEqual([
      "Uno;;adulto;Marco;;;;",
      "Due;;adulto;Anna;;;;",
      "Tre;;adulto;;;;;",
    ]);
  });

  it("uses the letter when a partner name is missing, equal, or a reserved word", () => {
    expect(usableSideNames({ a: null, b: "Anna" })).toEqual({ a: null, b: "Anna" });
    expect(usableSideNames({ a: "Anna", b: "ANNA" })).toEqual({ a: null, b: null });
    expect(usableSideNames({ a: "Àlex", b: "alex" })).toEqual({ a: null, b: null });
    expect(usableSideNames({ a: "B", b: "Entrambi" })).toEqual({ a: null, b: null });
    const csv = guestsToCsv(
      [
        guest({ id: "1", firstName: "Uno", side: "A" }),
        guest({ id: "2", firstName: "Due", side: "B" }),
      ],
      [],
      { a: "Sam", b: "sam" },
    );
    expect(lines(csv).slice(1, 3)).toEqual(["Uno;;adulto;A;;;;", "Due;;adulto;B;;;;"]);
  });

  it("a guest of a deleted group is written without a group", () => {
    const csv = guestsToCsv([guest({ id: "1", firstName: "Luca", groupId: "g2" })], groups, {
      a: null,
      b: null,
    });
    expect(lines(csv)[1]).toBe("Luca;;adulto;;;;;");
  });

  it("neutralises formulas and quotes separators, like the full export", () => {
    const csv = guestsToCsv(
      [
        guest({
          id: "1",
          firstName: "=Somma",
          phone: "+39 000 000 0001",
          notes: 'Dice "ciao"; poi\nva',
        }),
      ],
      [],
      { a: null, b: null },
    );
    expect(lines(csv)[1]).toBe(`'=Somma;;adulto;;;'+39 000 000 0001;;"Dice ""ciao""; poi\nva"`);
  });
});
