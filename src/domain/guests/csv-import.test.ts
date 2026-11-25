import { describe, expect, it } from "vitest";
import { CSV_BOM } from "../export/csv";
import { guestsToCsv } from "./csv-export";
import {
  decodeCsvBytes,
  detectSeparator,
  groupKey,
  IMPORT_TOO_LARGE,
  IMPORT_TOO_MANY_ROWS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseGuestsCsv,
  stripFormulaGuard,
  toImportPayload,
  type ImportContext,
  type ImportPreview,
} from "./csv-import";
import type { Guest, GuestGroup } from "./types";

// Invented people only; emails are @example.test, phones the fictional +39 000 000 NNNN.
const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  partners: { a: "Marco", b: "Anna" },
  groups: [],
  guests: [],
  ...over,
});
const parse = (text: string, over: Partial<ImportContext> = {}): ImportPreview => {
  const result = parseGuestsCsv(text, ctx(over));
  if (!result.ok) throw new Error(`unexpected failure: ${result.code}`);
  return result;
};
const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => bytes(...[...text].map((c) => c.charCodeAt(0)));

describe("decodeCsvBytes", () => {
  it("reads UTF-8, with or without a BOM", () => {
    const utf8 = new TextEncoder().encode("nome\nNiccolò");
    expect(decodeCsvBytes(utf8)).toEqual({ text: "nome\nNiccolò", encoding: "utf-8" });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    expect(decodeCsvBytes(withBom)).toEqual({ text: "nome\nNiccolò", encoding: "utf-8" });
  });

  it("falls back to Windows-1252 when the bytes are not UTF-8 ('Niccolò' is 0xF2 there)", () => {
    const file = bytes(...ascii("Niccol"), 0xf2);
    // The test bytes really are NOT valid UTF-8, so the fallback is what runs.
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(file)).toThrow();
    expect(decodeCsvBytes(file)).toEqual({ text: "Niccolò", encoding: "windows-1252" });
    // Windows-1252 specifics: euro sign 0x80, curly quote 0x92
    expect(decodeCsvBytes(bytes(0x80, 0x92))?.text).toBe("€’");
  });

  it("reads UTF-16 with a BOM (Excel 'Unicode text')", () => {
    const le = bytes(0xff, 0xfe, 0x41, 0x00, 0xf2, 0x00);
    expect(decodeCsvBytes(le)).toEqual({ text: "Aò", encoding: "utf-16le" });
    const be = bytes(0xfe, 0xff, 0x00, 0x41, 0x00, 0xf2);
    expect(decodeCsvBytes(be)).toEqual({ text: "Aò", encoding: "utf-16be" });
  });

  it("refuses something that is not text (a NUL byte)", () => {
    expect(decodeCsvBytes(bytes(0x50, 0x4b, 0x03, 0x04, 0x00, 0x00))).toBeNull();
  });
});

describe("separator, quotes, lines", () => {
  it("detects ; and , and prefers ; on a tie or when there is none", () => {
    expect(detectSeparator("a;b;c")).toBe(";");
    expect(detectSeparator("a,b,c")).toBe(",");
    expect(detectSeparator("a;b,c")).toBe(";");
    expect(detectSeparator("Mario Rossi")).toBe(";");
    expect(detectSeparator('"a;b;c",d')).toBe(",");
    expect(detectSeparator("\n\na,b")).toBe(",");
  });

  it("parses both separators to the same rows", () => {
    const semi = parse("nome;cognome;tipo\nMario;Rossi;bambino");
    const comma = parse("nome,cognome,tipo\nMario,Rossi,bambino");
    expect(semi.rows[0]?.guest).toEqual(comma.rows[0]?.guest);
    expect(semi.rows[0]?.guest).toMatchObject({ firstName: "Mario", category: "child" });
  });

  it("handles quotes: separator, doubled quote, CRLF and LF inside a field", () => {
    const text =
      'nome;cognome;note\r\n"Anna;Maria";"Bianchi";"dice ""ciao"";\r\nva a capo"\r\nLuca;Verdi;ok';
    const preview = parse(text);
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]?.guest).toMatchObject({
      firstName: "Anna;Maria",
      notes: 'dice "ciao";\r\nva a capo',
    });
    expect(preview.rows[0]?.source).toBe('"Anna;Maria";"Bianchi";"dice ""ciao"";\r\nva a capo"');
    expect(preview.rows[1]?.guest).toMatchObject({ firstName: "Luca", notes: "ok" });
  });

  it("an unclosed quote is an error on that row, not a crash", () => {
    const preview = parse('nome;note\nMario;"mai chiusa\nLuca;ok');
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]?.errors[0]).toMatch(/^virgolette non chiuse/);
    // the swallowed rest of a big file is not copied whole into `source` (REV-43)
    const big = parse(`nome;note\nMario;"${"x".repeat(100_000)}`);
    expect(big.rows[0]?.source.length).toBeLessThan(600);
  });

  it("line numbers are physical lines: a quoted field with line breaks moves the next row (REV-43)", () => {
    const preview = parse('nome;note\r\nUno;"a\r\nb\nc"\r\nDue;ok\rTre;ok');
    expect(preview.rows.map((r) => [r.line, r.guest?.firstName])).toEqual([
      [2, "Uno"],
      [5, "Due"],
      [6, "Tre"],
    ]);
  });

  it("a NUL in the text is dropped, so it cannot break the import later (REV-41)", () => {
    const preview = parse("nome;note\nMa\u0000rio;ci\u0000ao");
    expect(preview.rows[0]?.guest).toMatchObject({ firstName: "Mario", notes: "ciao" });
    // also for UTF-16 files
    expect(decodeCsvBytes(bytes(0xff, 0xfe, 0x41, 0x00, 0x00, 0x00, 0x42, 0x00))).toBeNull();
  });

  it("skips blank lines but keeps line numbers (BOM and CR/LF/CRLF endings)", () => {
    const preview = parse(`${CSV_BOM}nome\r\nUno\r\n\r\nDue\rTre\n  \nQuattro`);
    expect(preview.rows.map((r) => [r.line, r.guest?.firstName])).toEqual([
      [2, "Uno"],
      [4, "Due"],
      [5, "Tre"],
      [7, "Quattro"],
    ]);
  });

  it("only blank text is an 'empty' failure", () => {
    expect(parseGuestsCsv("  \n\r\n ", ctx())).toMatchObject({ ok: false, code: "empty" });
    expect(parseGuestsCsv("nome;cognome\n", ctx())).toMatchObject({ ok: false, code: "empty" });
  });
});

describe("header and columns", () => {
  it("the first line is a header only when every cell is a known column (with 'nome')", () => {
    const header = parse("Cognome;NOME;Gruppo\nRossi;Mario;Famiglia");
    expect(header.hasHeader).toBe(true);
    expect(header.rows[0]?.guest).toMatchObject({ firstName: "Mario", lastName: "Rossi" });
    expect(header.rows[0]?.group?.name).toBe("Famiglia");
    // accents and case ignored in the header
    expect(parse("Nome;Cognome;Tipo\nA;B;adulto").hasHeader).toBe(true);
    // a name that happens to be a column word, with other cells that are not: data
    const data = parse("Nome;Rossi\nLuca;Verdi");
    expect(data.hasHeader).toBe(false);
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0]?.guest).toMatchObject({ firstName: "Nome", lastName: "Rossi" });
    // a repeated column name is not a header either
    expect(parse("nome;nome\nA;B").hasHeader).toBe(false);
    // no 'nome' column: positional data
    expect(parse("cognome;tipo\nRossi;adulto").hasHeader).toBe(false);
  });

  it("without a header the order is nome, cognome, tipo, lato, gruppo, telefono, email, note", () => {
    const preview = parse(
      "Mario;Rossi;adulto;Marco;Rossi sr;+39 000 000 0001;mario@example.test;ciao",
    );
    expect(preview.rows[0]?.guest).toEqual({
      firstName: "Mario",
      lastName: "Rossi",
      category: "adult",
      side: "A",
      phone: "+39 000 000 0001",
      email: "mario@example.test",
      notes: "ciao",
    });
    expect(preview.rows[0]?.group).toEqual({ name: "Rossi sr", isNew: true });
  });

  it("a header may reorder and omit columns", () => {
    const preview = parse("email;nome\nlu@example.test;Luca");
    expect(preview.rows[0]?.guest).toMatchObject({ firstName: "Luca", email: "lu@example.test" });
  });

  it("common spellings of a header are accepted (E-mail, Cellulare)", () => {
    const preview = parse("Nome;E-mail;Cellulare\nLuca;lu@example.test;+39 000 000 0001");
    expect(preview.hasHeader).toBe(true);
    expect(preview.rows[0]?.guest).toMatchObject({
      email: "lu@example.test",
      phone: "+39 000 000 0001",
    });
  });

  it("a one-column list that starts with a title gets a warning, not a silent guest (REV-42)", () => {
    const preview = parse("Nome e cognome\nMario Rossi");
    expect(preview.rows[0]?.warnings).toEqual([
      "sembra un titolo, non un invitato: se è così, toglilo",
    ]);
    expect(preview.rows[1]?.warnings).toEqual([]);
    expect(parse("Mario Rossi\nNome e cognome").rows[1]?.warnings).toEqual([]);
  });

  it("a single column is the whole text in the name", () => {
    const preview = parse("Mario Rossi\nAnna Maria Bianchi\n\nLuca");
    expect(preview.rows.map((r) => [r.guest?.firstName, r.guest?.lastName])).toEqual([
      ["Mario Rossi", null],
      ["Anna Maria Bianchi", null],
      ["Luca", null],
    ]);
  });
});

describe("tipo and lato (AC18)", () => {
  it("tipo: adulto, bambino, neonato, empty = adulto, any case and accent; else an error", () => {
    const preview = parse("nome;tipo\nA;ADULTO\nB;Bambino\nC;neonato\nD;\nE;gigante");
    expect(preview.rows.map((r) => r.guest?.category ?? r.errors)).toEqual([
      "adult",
      "child",
      "infant",
      "adult",
      ["tipo non riconosciuto: scrivi adulto, bambino o neonato"],
    ]);
  });

  it("lato: partner names, letters, entrambi, empty (case and accents ignored)", () => {
    const text = "nome;lato\nA;marco\nB;ANNA\nC;a\nD;b\nE;Entrambi\nF;\nG;ENTRAMBI";
    expect(parse(text).rows.map((r) => r.guest?.side)).toEqual([
      "A",
      "B",
      "A",
      "B",
      "both",
      null,
      "both",
    ]);
    const accent = parse("nome;lato\nA;niccolo", { partners: { a: "Niccolò", b: "Anna" } });
    expect(accent.rows[0]?.guest?.side).toBe("A");
  });

  it("lato: an unknown value is an error that names the options", () => {
    const row = parse("nome;lato\nA;sposo").rows[0]!;
    expect(row.status).toBe("error");
    expect(row.errors).toEqual(["lato non riconosciuto: scrivi Marco, Anna o Entrambi"]);
    const unnamed = parse("nome;lato\nA;zio", { partners: { a: null, b: null } }).rows[0]!;
    expect(unnamed.errors).toEqual(["lato non riconosciuto: scrivi A, B o Entrambi"]);
  });

  it("lato: equal partner names are ambiguous (error), the letters still work", () => {
    const partners = { a: "Sam", b: "sam" };
    const rows = parse("nome;lato\nA;Sam\nB;A\nC;b", { partners }).rows;
    expect(rows[0]?.errors).toEqual(["lato ambiguo: i nomi dei partner sono uguali, scrivi A o B"]);
    expect(rows[1]?.guest?.side).toBe("A");
    expect(rows[2]?.guest?.side).toBe("B");
  });

  it("lato: a partner without a name is matched only by letter", () => {
    const rows = parse("nome;lato\nA;Anna\nB;A", { partners: { a: null, b: "Anna" } }).rows;
    expect(rows.map((r) => r.guest?.side)).toEqual(["B", "A"]);
  });
});

describe("errors and warnings per row (AC18, AC19)", () => {
  it("empty name, too long name, bad phone, bad email, long notes: one error row each", () => {
    const long = "x".repeat(81);
    const preview = parse(
      [
        "nome;cognome;telefono;email;note",
        ";Rossi;;;",
        `${long};;;;`,
        "Ok;;12345;;",
        "Ok2;;;niente;",
        `Ok3;;;;${"n".repeat(501)}`,
        `Ok4;${long};;;`,
        "Giusto;;+39 000 000 0001;g@example.test;ok",
      ].join("\n"),
    );
    expect(preview.rows.map((r) => r.errors)).toEqual([
      ["manca il nome"],
      ["il nome è troppo lungo (max 80)"],
      ["telefono non valido"],
      ["email non valida"],
      ["note troppo lunghe (max 500)"],
      ["il cognome è troppo lungo (max 80)"],
      [],
    ]);
    expect(preview).toMatchObject({ ready: 1, invalid: 6, warned: 0 });
    expect(preview.rows[0]?.line).toBe(2);
  });

  it("a row can have several errors", () => {
    const row = parse("nome;tipo;email\n;gigante;niente").rows[0]!;
    expect(row.errors).toHaveLength(3);
  });

  it("duplicates are only a warning: against the existing guests and inside the file", () => {
    const existing: Guest[] = [
      {
        id: "1",
        firstName: "Niccolò",
        lastName: "Rossi",
        category: "adult",
        side: null,
        phone: null,
        email: null,
        notes: null,
        groupId: null,
        tableId: null,
        deletedAt: null,
      },
      {
        id: "2",
        firstName: "Cancellato",
        lastName: "Verdi",
        category: "adult",
        side: null,
        phone: null,
        email: null,
        notes: null,
        groupId: null,
        tableId: null,
        deletedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const preview = parse("nome;cognome\nNICCOLO;rossi\nCancellato;Verdi\nAnna;Neri\nanna; NERI ", {
      guests: existing,
    });
    expect(preview.rows.map((r) => r.warnings)).toEqual([
      ["c'è già NICCOLO rossi"],
      [],
      [],
      ["ripetuta: è uguale alla riga 4"],
    ]);
    expect(preview).toMatchObject({ ready: 4, invalid: 0, warned: 2 });
  });
});

describe("groups", () => {
  it("reuses an existing group (case and spaces ignored) and lists the new ones once", () => {
    const groups: GuestGroup[] = [{ id: "g", name: "Famiglia  Rossi", deletedAt: null }];
    const preview = parse(
      "nome;gruppo\nA;famiglia rossi\nB;Amici\nC;  amici \nD;AMICI\nE;Colleghi\nF;",
      { groups },
    );
    expect(preview.rows.map((r) => r.group)).toEqual([
      { name: "Famiglia  Rossi", isNew: false },
      { name: "Amici", isNew: true },
      { name: "Amici", isNew: true },
      { name: "Amici", isNew: true },
      { name: "Colleghi", isNew: true },
      null,
    ]);
    expect(preview.newGroups).toEqual(["Amici", "Colleghi"]);
  });

  it("accents are NOT ignored for groups (AC18: case and spaces only)", () => {
    expect(groupKey("Università ")).not.toBe(groupKey("universita"));
    expect(groupKey("  Zii   Veri ")).toBe(groupKey("zii veri"));
  });

  it("a row with an error creates no group; a name over 80 is an error", () => {
    const preview = parse(`nome;lato;gruppo\n;;Fantasma\nOk;;${"g".repeat(81)}\nBene;;Vero`);
    expect(preview.newGroups).toEqual(["Vero"]);
    expect(preview.rows[1]?.errors).toEqual(["il gruppo è troppo lungo (max 80)"]);
  });
});

describe("formula guard (the exact inverse of csvCell)", () => {
  it("removes the apostrophe only before = + - @ TAB CR", () => {
    expect(stripFormulaGuard("'+39 000 000 0001")).toBe("+39 000 000 0001");
    expect(stripFormulaGuard("'=SOMMA(1)")).toBe("=SOMMA(1)");
    expect(stripFormulaGuard("'-5")).toBe("-5");
    expect(stripFormulaGuard("'@casa")).toBe("@casa");
    expect(stripFormulaGuard("'\tx")).toBe("\tx");
    expect(stripFormulaGuard("'\rx")).toBe("\rx");
    expect(stripFormulaGuard("'ciao")).toBe("'ciao");
    // one apostrophe comes off apostrophes + trigger: the guard is injective (REV-39)
    expect(stripFormulaGuard("''+1")).toBe("'+1");
    expect(stripFormulaGuard("''ciao")).toBe("''ciao");
    expect(stripFormulaGuard("+39")).toBe("+39");
  });

  it("is applied to every cell, including a quoted one with a CR inside", () => {
    const preview = parse("nome;cognome;telefono\n'=Mario;\"'\rRossi\";'+39 000 000 0001");
    expect(preview.rows[0]?.guest).toMatchObject({
      firstName: "=Mario",
      lastName: "Rossi", // CR kept by the guard, then trimmed like any space
      phone: "+39 000 000 0001",
    });
  });
});

describe("round trip: export, then import", () => {
  const people: Guest[] = [
    {
      id: "1",
      firstName: "Niccolò",
      lastName: "Rossi",
      category: "adult",
      side: "A",
      phone: "+39 000 000 0001",
      email: "nic@example.test",
      notes: `Allergia (finta); "senza noci"\nsecondo rigo`,
      groupId: "g1",
      tableId: null,
      deletedAt: null,
    },
    {
      id: "2",
      firstName: "Lucia",
      lastName: null,
      category: "infant",
      side: "both",
      phone: null,
      email: null,
      // text that already starts with an apostrophe + trigger comes back unchanged (REV-39)
      notes: "'=ok",
      groupId: "g1",
      tableId: "t1",
      deletedAt: null,
    },
    {
      id: "3",
      firstName: "=Formula",
      lastName: "-Meno",
      category: "child",
      side: "B",
      phone: "+39 (000) 000-0003",
      email: null,
      notes: "@nota",
      groupId: null,
      tableId: null,
      deletedAt: null,
    },
    {
      id: "4",
      firstName: "Senza lato",
      lastName: "Eliminato gruppo",
      category: "adult",
      side: null,
      phone: null,
      email: null,
      notes: "''+1",
      groupId: "g2",
      tableId: null,
      deletedAt: null,
    },
  ];
  const groups: GuestGroup[] = [
    { id: "g1", name: "Famiglia Rossi", deletedAt: null },
    { id: "g2", name: "Gruppo eliminato", deletedAt: "2026-01-01T00:00:00Z" },
  ];
  const expected = (guest: Guest) => ({
    firstName: guest.firstName,
    lastName: guest.lastName,
    category: guest.category,
    side: guest.side,
    phone: guest.phone,
    email: guest.email,
    notes: guest.notes,
  });

  it.each([
    ["names", { a: "Marco", b: "Anna" }],
    ["letters (equal names)", { a: "Sam", b: "SAM" }],
    ["letters (no names)", { a: null, b: null }],
  ])("gives the same data back (%s)", (_label, partners) => {
    const csv = guestsToCsv(people, groups, partners);
    const preview = parse(csv, { partners });
    expect(preview.hasHeader).toBe(true);
    expect(preview.invalid).toBe(0);
    expect(preview.rows.map((r) => r.guest)).toEqual(people.map(expected));
    expect(preview.rows.map((r) => r.group?.name ?? null)).toEqual([
      "Famiglia Rossi",
      "Famiglia Rossi",
      null,
      null, // deleted group: exported without a group
    ]);
  });

  it("'+39' survives and 'Niccolò' survives with the Windows-1252 bytes Excel writes", () => {
    const csv = guestsToCsv(people, groups, { a: "Marco", b: "Anna" });
    // build the 1252 file by hand: every char is ASCII except ò (0xF2); the BOM is a UTF-8 thing
    const out: number[] = [];
    for (const ch of csv.replace(CSV_BOM, "")) {
      const code = ch.charCodeAt(0);
      out.push(ch === "ò" ? 0xf2 : code);
      expect(code < 128 || ch === "ò").toBe(true);
    }
    const file = new Uint8Array(out);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(file)).toThrow();
    const decoded = decodeCsvBytes(file)!;
    expect(decoded.encoding).toBe("windows-1252");
    const preview = parse(decoded.text);
    expect(preview.rows[0]?.guest).toMatchObject({
      firstName: "Niccolò",
      phone: "+39 000 000 0001",
    });
    expect(preview.rows.map((r) => r.guest)).toEqual(people.map(expected));
  });

  it("the UTF-8 file with BOM, as exported, decodes and imports the same", () => {
    const csv = guestsToCsv(people, groups, { a: "Marco", b: "Anna" });
    const decoded = decodeCsvBytes(new TextEncoder().encode(csv))!;
    expect(decoded.encoding).toBe("utf-8");
    expect(parse(decoded.text).rows.map((r) => r.guest)).toEqual(people.map(expected));
  });
});

describe("limits: 500 rows, 900 KB", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `Persona${i};Test`).join("\n");

  it("accepts 500 rows and refuses 501 with a fixed message", () => {
    expect(MAX_IMPORT_ROWS).toBe(500);
    const ok = parseGuestsCsv(rows(500), ctx());
    expect(ok).toMatchObject({ ok: true, ready: 500 });
    expect(parseGuestsCsv(rows(501), ctx())).toEqual({
      ok: false,
      code: "too_many_rows",
      message: IMPORT_TOO_MANY_ROWS,
    });
  });

  it("blank lines and the header do not count towards the 500", () => {
    const text = `nome;cognome\n\n${rows(500)}\n\n`;
    expect(parseGuestsCsv(text, ctx())).toMatchObject({ ok: true, ready: 500 });
  });

  it("rows with errors count too (they are rows of the file)", () => {
    const bad = Array.from({ length: 501 }, () => ";x").join("\n");
    expect(parseGuestsCsv(bad, ctx())).toMatchObject({ ok: false, code: "too_many_rows" });
  });

  it("500 realistic rows are far below 900 KB", () => {
    const text = Array.from(
      { length: 500 },
      (_, i) =>
        `Persona${i};Cognome${i};adulto;Marco;Famiglia ${i % 40};+39 000 000 ${String(i).padStart(4, "0")};p${i}@example.test;Note di prova ${i}`,
    ).join("\n");
    const preview = parse(text);
    expect(preview.ready).toBe(500);
    expect(preview.payloadBytes).toBeLessThan(150 * 1024);
  });

  it("the theoretical worst case (every field at its maximum, 3-byte characters) is refused as too large", () => {
    const wide = (n: number) => "あ".repeat(n);
    const row = [
      wide(80),
      wide(80),
      "bambino",
      "Marco",
      wide(80),
      "+".concat("1".repeat(19)),
      `${wide(240)}@b.c`,
      wide(500),
    ].join(";");
    const text = Array.from({ length: 500 }, () => row).join("\n");
    expect(text.length).toBeLessThan(4_000_000);
    expect(parseGuestsCsv(text, ctx())).toEqual({
      ok: false,
      code: "too_large",
      message: IMPORT_TOO_LARGE,
    });
    // ... while a handful of the same rows are fine and measured in bytes, not characters
    const few = parse(Array.from({ length: 50 }, () => row).join("\n"));
    expect(few.ready).toBe(50);
    expect(few.payloadBytes).toBeGreaterThan(50 * 3000);
    expect(few.payloadBytes).toBeLessThan(MAX_IMPORT_BYTES);
  });

  it("text beyond the raw bound is refused before parsing", () => {
    expect(parseGuestsCsv("x".repeat(4_000_001), ctx())).toMatchObject({
      ok: false,
      code: "too_large",
    });
  });
});

describe("toImportPayload", () => {
  it("is one object per READY row, with the group as a name", () => {
    const preview = parse(
      "nome;cognome;tipo;lato;gruppo;telefono;email;note\nMario;Rossi;neonato;Anna;Rossi;+39 000 000 0001;m@example.test;ciao\n;Senza nome;;;;;;\nLuca;;;;;;;",
    );
    expect(toImportPayload(preview)).toEqual([
      {
        first_name: "Mario",
        last_name: "Rossi",
        category: "infant",
        side: "B",
        group: "Rossi",
        phone: "+39 000 000 0001",
        email: "m@example.test",
        notes: "ciao",
      },
      {
        first_name: "Luca",
        last_name: null,
        category: "adult",
        side: null,
        group: null,
        phone: null,
        email: null,
        notes: null,
      },
    ]);
  });
});
