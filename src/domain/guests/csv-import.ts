import {
  CATEGORY_WORDS,
  GUEST_CSV_COLUMNS,
  SIDE_BOTH_WORD,
  usableSideNames,
  type PartnerNames,
} from "./csv-export";
import { duplicateKey } from "./duplicates";
import { normalizeText } from "./normalize";
import type { Guest, GuestCategory, GuestSide } from "./types";
import { LIMITS, validateGuest, type GuestErrors } from "./validation";

/**
 * Import of guests from pasted text or a CSV file (AC17-AC19). Pure: the file never leaves the
 * browser; the server action re-runs `parseGuestsCsv` on the rows it receives (plan P3).
 *
 * The RULES of a person (limits, phone/email shape) are not repeated here: validity comes from
 * `validateGuest`; this file only maps the columns, words (tipo, lato) and messages of a row.
 */

/** At most this many data rows per import (AC19). Blank lines and the header do not count. */
export const MAX_IMPORT_ROWS = 500;
/** The serialized payload must stay under the 1 MB Server Action body (plan P3). */
export const MAX_IMPORT_BYTES = 900 * 1024;
/** Raw input beyond this is refused before parsing (even 500 maximal rows are ~1.7 MB of text). */
const MAX_INPUT_CHARS = 4_000_000;

export const IMPORT_TOO_MANY_ROWS = `Sono più di ${MAX_IMPORT_ROWS} righe: importane al massimo ${MAX_IMPORT_ROWS} alla volta.`;
export const IMPORT_TOO_LARGE = "Il file è troppo grande: dividilo in due.";
export const IMPORT_UNREADABLE =
  "Non riesco a leggere il file. Salvalo come CSV (UTF-8) e riprova.";
export const IMPORT_EMPTY = "Non ho trovato nessuna persona da importare.";

// ---------------------------------------------------------------------------------------------
// Bytes to text
// ---------------------------------------------------------------------------------------------

export type CsvEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

/**
 * File bytes to text. UTF-8 first (strict: invalid bytes throw), then Windows-1252, which is what
 * Excel on Windows writes ("Niccolò" is one byte 0xF2 there, not valid UTF-8). A UTF-8 or UTF-16
 * byte order mark is removed. `null` = not text (a NUL byte inside): the caller says
 * `IMPORT_UNREADABLE`.
 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: CsvEncoding } | null {
  let encoding: CsvEncoding = "utf-8";
  let body = bytes;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    body = bytes.subarray(3);
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    body = bytes.subarray(2);
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    body = bytes.subarray(2);
  }
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(body);
  } catch {
    encoding = "windows-1252";
    text = new TextDecoder("windows-1252").decode(body);
  }
  // A NUL is never in a text list, whatever the encoding (REV-41): binary file, or garbage.
  if (text.includes("\u0000")) return null;
  return { text: text.replace(/^﻿/, ""), encoding };
}

// ---------------------------------------------------------------------------------------------
// CSV tokenizer (RFC 4180)
// ---------------------------------------------------------------------------------------------

interface RawRecord {
  cells: string[];
  /**
   * Original text of the record (for "Copia le righe saltate"), without the line break. For an
   * unclosed quote, which swallows the rest of the text, only the start is kept.
   */
  source: string;
  /** Physical line (1-based, in the editor's sense) where the record starts (REV-43). */
  line: number;
  unclosedQuote: boolean;
  blank: boolean;
}

const MAX_BROKEN_SOURCE = 500;

/** `;` or `,`, from the first non-blank line outside quotes; a tie or none = `;` (Italian default). */
export function detectSeparator(text: string): ";" | "," {
  let semicolons = 0;
  let commas = 0;
  let inQuotes = false;
  let atFieldStart = true;
  let seen = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i += 1;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === "\n" || ch === "\r") {
      if (seen || semicolons + commas > 0) break;
      atFieldStart = true;
    } else {
      if (ch === ";") semicolons += 1;
      else if (ch === ",") commas += 1;
      if (ch.trim() !== "") seen = true;
      atFieldStart = ch === ";" || ch === ",";
    }
  }
  return commas > semicolons ? "," : ";";
}

function tokenize(text: string, separator: string): RawRecord[] {
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;
  let start = 0;
  let line = 1; // physical line of the current position
  let startLine = 1;
  const finish = (end: number, unclosed: boolean) => {
    cells.push(field);
    const source = text.slice(start, end);
    records.push({
      cells,
      source:
        unclosed && source.length > MAX_BROKEN_SOURCE
          ? `${source.slice(0, MAX_BROKEN_SOURCE)}…`
          : source,
      line: startLine,
      unclosedQuote: unclosed,
      blank: cells.every((c) => c.trim() === ""),
    });
    cells = [];
    field = "";
    atFieldStart = true;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else {
        field += ch;
        // a line break inside a quoted field still moves the physical line (CRLF counts once)
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line += 1;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
    } else if (ch === separator) {
      cells.push(field);
      field = "";
      atFieldStart = true;
    } else if (ch === "\r" || ch === "\n") {
      finish(i, false);
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      start = i + 1;
      line += 1;
      startLine = line;
    } else {
      field += ch;
      atFieldStart = false;
    }
  }
  if (start < text.length || cells.length > 0 || field !== "" || inQuotes) {
    finish(text.length, inQuotes);
  }
  return records;
}

/**
 * Exact inverse of the export's formula guard: `csvCell` prefixes text that starts with
 * `= + - @ TAB CR`, or with apostrophes followed by one of them, with an apostrophe; here one
 * apostrophe is removed from such a start (REV-39: the guard is injective, so `'=ok`
 * written by the user comes back as `'=ok`).
 */
export function stripFormulaGuard(cell: string): string {
  return /^'+[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell;
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

type Column = (typeof GUEST_CSV_COLUMNS)[number];
const COLUMN_SET: ReadonlySet<string> = new Set(GUEST_CSV_COLUMNS);

export interface ImportContext {
  /** First names of the partners (A and B), as the app shows them. */
  partners: PartnerNames;
  /** Live groups of the wedding: a `gruppo` with the same name (case and spaces ignored) reuses one. */
  groups: readonly { name: string }[];
  /** Live guests, only to warn about duplicates (never an error: BR4). */
  guests: readonly Pick<Guest, "firstName" | "lastName" | "deletedAt">[];
}

/** A person ready to import, with empty text already turned into `null`. */
export interface ImportGuest {
  firstName: string;
  lastName: string | null;
  category: GuestCategory;
  side: GuestSide | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface ImportRow {
  /** Number of the record in the text (header and blank lines count): "Riga 7". */
  line: number;
  /** Original text of the row, for "Copia le righe saltate". */
  source: string;
  status: "ready" | "error";
  /** Messages in Italian without the "Riga N:" prefix. Empty when `ready`. */
  errors: string[];
  /** Duplicates and the like: the row is still imported. */
  warnings: string[];
  /** Set when `ready`. */
  guest: ImportGuest | null;
  /** Set when `ready` and the row has a group. `isNew` = it does not exist yet. */
  group: { name: string; isNew: boolean } | null;
}

export interface ImportPreview {
  ok: true;
  rows: ImportRow[];
  ready: number;
  invalid: number;
  /** Ready rows with at least one warning. */
  warned: number;
  /** Names of the groups the import will create, in order of appearance. */
  newGroups: string[];
  hasHeader: boolean;
  /** Size of the payload that would be sent, in bytes. */
  payloadBytes: number;
}

export type ImportFailure = {
  ok: false;
  code: "too_many_rows" | "too_large" | "empty";
  message: string;
};

/** What `import_guests` receives for each ready row (one object per person). */
export interface ImportRowPayload {
  first_name: string;
  last_name: string | null;
  category: GuestCategory;
  side: GuestSide | null;
  /** Group NAME: the database reuses an existing group (case and spaces ignored) or creates it. */
  group: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

/** Case and spaces ignored, accents kept (AC18 for `gruppo`). */
export function groupKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

const textOrNull = (value: string | undefined): string | null => {
  const trimmed = stripFormulaGuard(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/** Common spellings of a column in a header (REV-42); the exported names are the canonical ones. */
const HEADER_ALIASES: Readonly<Record<string, Column>> = {
  "e-mail": "email",
  mail: "email",
  cellulare: "telefono",
  tel: "telefono",
  cell: "telefono",
};

/** A first line like this in a one-column list is probably a title, not a guest (REV-42). */
const TITLE_LIKE: ReadonlySet<string> = new Set([
  "nome e cognome",
  "nome cognome",
  "nome completo",
  "nominativo",
  "invitato",
  "invitati",
  "ospite",
  "ospiti",
  "elenco invitati",
  "lista invitati",
]);

function headerMap(record: RawRecord): Column[] | null {
  const names = record.cells.map((c) => {
    const name = normalizeText(stripFormulaGuard(c));
    return HEADER_ALIASES[name] ?? name;
  });
  const known = names.filter((n) => n !== "");
  if (known.length === 0 || !known.includes("nome")) return null;
  if (!known.every((n) => COLUMN_SET.has(n))) return null;
  // Repeated column names make the mapping ambiguous: treat the line as data instead.
  if (new Set(known).size !== known.length) return null;
  return names.map((n) => n as Column);
}

const CATEGORY_BY_WORD: ReadonlyMap<string, GuestCategory> = new Map(
  (Object.entries(CATEGORY_WORDS) as [GuestCategory, string][]).map(([category, word]) => [
    word,
    category,
  ]),
);

function sideOf(
  raw: string | null,
  partners: PartnerNames,
): { side: GuestSide | null } | { error: string } {
  if (raw === null) return { side: null };
  const key = normalizeText(raw);
  if (key === SIDE_BOTH_WORD || key === "both") return { side: "both" };
  const usable = usableSideNames(partners);
  if (usable.a !== null && key === normalizeText(usable.a)) return { side: "A" };
  if (usable.b !== null && key === normalizeText(usable.b)) return { side: "B" };
  if (key === "a") return { side: "A" };
  if (key === "b") return { side: "B" };
  const keyA = normalizeText(partners.a);
  const keyB = normalizeText(partners.b);
  if (key === keyA || key === keyB) {
    // The name exists but cannot tell the partners apart (both called alike): ask for the letter.
    return { error: "lato ambiguo: i nomi dei partner sono uguali, scrivi A o B" };
  }
  return {
    error: `lato non riconosciuto: scrivi ${usable.a ?? "A"}, ${usable.b ?? "B"} o Entrambi`,
  };
}

const FIELD_MESSAGES: Record<keyof GuestErrors, string> = {
  firstName: "manca il nome o è troppo lungo",
  lastName: `il cognome è troppo lungo (max ${LIMITS.name})`,
  category: "tipo non riconosciuto: scrivi adulto, bambino o neonato",
  side: "lato non valido",
  phone: "telefono non valido",
  email: "email non valida",
  notes: `note troppo lunghe (max ${LIMITS.notes})`,
};

function payloadOf(rows: readonly ImportRow[]): ImportRowPayload[] {
  return rows.flatMap((row) =>
    row.status === "ready" && row.guest
      ? [
          {
            first_name: row.guest.firstName,
            last_name: row.guest.lastName,
            category: row.guest.category,
            side: row.guest.side,
            group: row.group?.name ?? null,
            phone: row.guest.phone,
            email: row.guest.email,
            notes: row.guest.notes,
          },
        ]
      : [],
  );
}

/** The rows `import_guests` receives: the ready ones, in order. */
export function toImportPayload(preview: ImportPreview): ImportRowPayload[] {
  return payloadOf(preview.rows);
}

/** Bytes of the JSON body that carries `rows` (UTF-8). */
export function payloadSize(rows: readonly ImportRowPayload[]): number {
  return new TextEncoder().encode(JSON.stringify({ p_rows: rows })).length;
}

/**
 * Pasted text (or the text of a file) to a preview (AC17-AC19).
 * - separator `;` or `,` detected; RFC 4180 quotes, also with line breaks inside a field;
 * - the first line is a header only if EVERY cell is a known column name (and `nome` is there);
 *   without header the order is nome, cognome, tipo, lato, gruppo, telefono, email, note;
 * - a single column (no header) = the whole text is the name;
 * - at most 500 data rows and a payload under 900 KB, else a failure with a fixed message.
 */
export function parseGuestsCsv(
  text: string,
  context: ImportContext,
): ImportPreview | ImportFailure {
  if (text.length > MAX_INPUT_CHARS) {
    return { ok: false, code: "too_large", message: IMPORT_TOO_LARGE };
  }
  // A NUL typed or pasted is dropped: Postgres refuses it in jsonb and one cell would fail the import.
  const input = text.replace(/^﻿/, "").replaceAll("\u0000", "");
  const records = tokenize(input, detectSeparator(input));
  const firstData = records.findIndex((r) => !r.blank);
  if (firstData === -1) return { ok: false, code: "empty", message: IMPORT_EMPTY };

  const header = headerMap(records[firstData]!);
  const columns: readonly Column[] = header ?? GUEST_CSV_COLUMNS;
  const singleColumn = header === null && records.every((r) => r.blank || r.cells.length === 1);

  const dataRecords = records
    .map((record) => ({ record, line: record.line }))
    .filter(({ record }, index) => !record.blank && !(header && index === firstData));
  const firstLine = dataRecords[0]?.line;
  if (dataRecords.length === 0) return { ok: false, code: "empty", message: IMPORT_EMPTY };
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return { ok: false, code: "too_many_rows", message: IMPORT_TOO_MANY_ROWS };
  }

  const known = new Map<string, string>(); // groupKey -> display name (existing and new)
  for (const group of context.groups) {
    const key = groupKey(group.name);
    if (key !== "" && !known.has(key)) known.set(key, group.name);
  }
  const existing = new Set(known.keys());
  const seenNames = new Map<string, number>(); // duplicateKey -> first line in the file
  const liveNames = new Set(
    context.guests.filter((g) => !g.deletedAt).map((g) => duplicateKey(g.firstName, g.lastName)),
  );
  const newGroups: string[] = [];

  const rows: ImportRow[] = dataRecords.map(({ record, line }) => {
    const cell = (column: Column): string | null => {
      if (singleColumn) return column === "nome" ? textOrNull(record.cells[0]) : null;
      const index = columns.indexOf(column);
      return index === -1 ? null : textOrNull(record.cells[index]);
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    if (record.unclosedQuote) {
      errors.push("virgolette non chiuse: da qui in poi il testo è incluso in questa riga");
    }

    const categoryRaw = cell("tipo");
    const category =
      categoryRaw === null ? "adult" : CATEGORY_BY_WORD.get(normalizeText(categoryRaw));
    if (category === undefined) errors.push(FIELD_MESSAGES.category);
    const side = sideOf(cell("lato"), context.partners);
    if ("error" in side) errors.push(side.error);

    const guest: ImportGuest = {
      firstName: cell("nome") ?? "",
      lastName: cell("cognome"),
      category: category ?? "adult",
      side: "side" in side ? side.side : null,
      phone: cell("telefono"),
      email: cell("email"),
      notes: cell("note"),
    };
    // Validity of the person's own fields comes from the single source (validation.ts).
    const found = validateGuest(guest);
    delete found.category; // already reported with the import's own words
    delete found.side;
    if (found.firstName) {
      errors.push(
        guest.firstName === "" ? "manca il nome" : `il nome è troppo lungo (max ${LIMITS.name})`,
      );
      delete found.firstName;
    }
    for (const field of Object.keys(found) as (keyof GuestErrors)[])
      errors.push(FIELD_MESSAGES[field]);

    const groupName = cell("gruppo");
    if (groupName !== null && groupName.length > LIMITS.name) {
      errors.push(`il gruppo è troppo lungo (max ${LIMITS.name})`);
    }
    if (errors.length > 0) {
      return {
        line,
        source: record.source,
        status: "error",
        errors,
        warnings,
        guest: null,
        group: null,
      };
    }

    if (singleColumn && line === firstLine && TITLE_LIKE.has(normalizeText(guest.firstName))) {
      warnings.push("sembra un titolo, non un invitato: se è così, toglilo");
    }
    const key = duplicateKey(guest.firstName, guest.lastName);
    if (liveNames.has(key))
      warnings.push(`c'è già ${[guest.firstName, guest.lastName].filter(Boolean).join(" ")}`);
    const earlier = seenNames.get(key);
    if (earlier !== undefined) warnings.push(`ripetuta: è uguale alla riga ${earlier}`);
    else seenNames.set(key, line);

    let group: ImportRow["group"] = null;
    if (groupName !== null) {
      const groupId = groupKey(groupName);
      const display = known.get(groupId);
      if (display !== undefined) group = { name: display, isNew: !existing.has(groupId) };
      else {
        known.set(groupId, groupName);
        newGroups.push(groupName);
        group = { name: groupName, isNew: true };
      }
    }
    return { line, source: record.source, status: "ready", errors, warnings, guest, group };
  });

  const payload = payloadOf(rows);
  const payloadBytes = payloadSize(payload);
  if (payloadBytes > MAX_IMPORT_BYTES) {
    return { ok: false, code: "too_large", message: IMPORT_TOO_LARGE };
  }
  const ready = rows.filter((r) => r.status === "ready");
  return {
    ok: true,
    rows,
    ready: ready.length,
    invalid: rows.length - ready.length,
    warned: ready.filter((r) => r.warnings.length > 0).length,
    newGroups,
    hasHeader: header !== null,
    payloadBytes,
  };
}
