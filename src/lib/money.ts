/**
 * Money in integer cents (plan §6, AC38, D40). Amounts are parsed from the string straight to
 * cents: never `parseFloat * 100`, never floating point.
 *
 * Rules (D40):
 * - digits with `,` or `.` followed by 1-2 digits = decimals ("12,5" = 12,50 €, "1.5" = 1,50 €);
 * - `.` followed by exactly 3 digits and no comma = thousands ("1.500" = 1.500,00 €);
 * - 3 digits after a comma = error ("12,345");
 * - both separators: the last one is the decimal mark, the other one groups thousands, so both
 *   "1.234,56" and a pasted "1,234.56" are accepted;
 * - at least 0, at most 2 decimals, at most 1 billion euros.
 */

export type Cents = number;

/** Inline error shown under an amount field (AC38). */
export const MONEY_ERROR_MESSAGE = "Inserisci un importo in euro, ad esempio 1.500,00";

/** 1 billion euros, in cents (the DB check caps at the same value, plan §3). */
export const MAX_CENTS: Cents = 100_000_000_000;

export type MoneyParseErrorReason =
  "empty" | "negative" | "invalid" | "too-many-decimals" | "too-large";

export type MoneyParseResult =
  | { readonly ok: true; readonly cents: Cents }
  | { readonly ok: false; readonly reason: MoneyParseErrorReason; readonly message: string };

function fail(reason: MoneyParseErrorReason): MoneyParseResult {
  return { ok: false, reason, message: MONEY_ERROR_MESSAGE };
}

const GROUPED_INT = (sep: string) => new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})+$`);

/** Integer part with thousands separators removed, or null when the grouping is not valid. */
function integerPart(raw: string, thousandsSep: "." | ","): string | null {
  if (!raw.includes(thousandsSep)) return /^\d+$/.test(raw) ? raw : null;
  return GROUPED_INT(thousandsSep).test(raw) ? raw.split(thousandsSep).join("") : null;
}

function toCents(integer: string, decimals: string): MoneyParseResult {
  if (integer.length > 13) return fail("too-large");
  const cents = Number(integer) * 100 + Number(decimals.padEnd(2, "0"));
  return cents > MAX_CENTS ? fail("too-large") : { ok: true, cents };
}

export function parseEuroToCents(input: string): MoneyParseResult {
  const text = input.replace(/[\s  ]/g, "").replace(/€/g, "");
  if (text === "") return fail("empty");
  if (text.startsWith("-") || text.startsWith("−")) return fail("negative");
  if (!/^[\d.,]+$/.test(text)) return fail("invalid");

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (!hasComma && !hasDot) return toCents(text, "");

  // Both separators: the last one is the decimal mark.
  if (hasComma && hasDot) {
    const decimalSep = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    const [intRaw, decRaw, ...rest] = text.split(decimalSep);
    if (rest.length > 0 || intRaw === undefined || decRaw === undefined) return fail("invalid");
    const integer = integerPart(intRaw, thousandsSep);
    if (integer === null || !intRaw.includes(thousandsSep)) return fail("invalid");
    return decimalsToCents(integer, decRaw);
  }

  if (hasComma) {
    const parts = text.split(",");
    if (parts.length !== 2) return fail("invalid");
    const [intRaw, decRaw] = parts as [string, string];
    if (!/^\d+$/.test(intRaw)) return fail("invalid");
    return decimalsToCents(intRaw, decRaw);
  }

  // Dots only.
  const parts = text.split(".");
  if (parts.length === 2) {
    const [intRaw, decRaw] = parts as [string, string];
    if (/^\d+$/.test(intRaw) && /^\d{1,2}$/.test(decRaw)) return toCents(intRaw, decRaw);
  }
  const integer = integerPart(text, ".");
  if (integer === null || text.startsWith("0")) return fail("invalid");
  return toCents(integer, "");
}

function decimalsToCents(integer: string, decimals: string): MoneyParseResult {
  if (!/^\d+$/.test(decimals)) return fail("invalid");
  if (decimals.length > 2) return fail("too-many-decimals");
  return toCents(integer, decimals);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function assertCents(cents: Cents): void {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Not an integer amount: ${cents}`);
}

/** "1.234,56" (always 2 decimals, for amount fields). Written by hand: `it-IT` does not group 4 digits. */
export function formatCents(cents: Cents): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  return `${sign}${groupThousands(String(euros))},${String(abs % 100).padStart(2, "0")}`;
}

/** "€ 1.200" for whole euros, "€ 1.200,50" otherwise (messages, cards). */
export function formatEuro(cents: Cents): string {
  assertCents(cents);
  const text = formatCents(cents);
  return `€ ${cents % 100 === 0 ? text.slice(0, -3) : text}`;
}

/** "1500,00": no thousands separator, for CSV cells that spreadsheets must read as numbers. */
export function formatCentsPlain(cents: Cents): string {
  assertCents(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
