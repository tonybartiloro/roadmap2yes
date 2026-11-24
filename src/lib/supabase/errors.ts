/**
 * Classification of backend failures (plan §9, DES-16).
 *
 * Two outcomes only:
 * - `paused`: the Supabase free project is paused (HTTP 540 or a "project paused" response);
 * - `unreachable`: network error, timeout, DNS/connection failure, any other 5xx.
 *
 * Proxy and root layout use it to rewrite to `/servizio?motivo=…` instead of redirecting to the
 * login. Anything else (4xx, RLS/permission errors, validation, unknown shapes) is an
 * APPLICATION error, not an infrastructure outage: `classifyDbError` returns `null` for it.
 */
export type DbErrorKind = "paused" | "unreachable";

const PAUSED_STATUS = 540;
const NETWORK_ERROR_NAMES = new Set([
  "AuthRetryableFetchError",
  "AbortError",
  "TimeoutError",
  "FetchError",
]);
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);
// PostgREST codes for "cannot connect to / acquire a database connection".
const POSTGREST_CONNECTION_CODES = new Set(["PGRST000", "PGRST001", "PGRST002", "PGRST003"]);

const PAUSED_TEXT = /project\s+(is\s+)?paused|paused\s+project|project\s+has\s+been\s+paused/i;
const NETWORK_TEXT =
  /fetch failed|failed to fetch|networkerror|network request failed|load failed|socket hang up|timed? ?out|timeout/i;

type Loose = Record<string, unknown>;

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function statusOf(error: Loose): number | undefined {
  for (const key of ["status", "statusCode"]) {
    const value = error[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** Walks `cause` chains (undici puts ECONNREFUSED in `error.cause`). */
function* chain(error: unknown): Generator<Loose> {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && isObject(current); depth += 1) {
    yield current;
    current = current["cause"];
  }
}

export function classifyDbError(error: unknown): DbErrorKind | null {
  if (error === null || error === undefined) return null;

  // A `Response`-like input or `{ error }` wrapper from supabase-js.
  const subject = isObject(error) && isObject(error["error"]) ? error["error"] : error;
  if (typeof subject === "string") {
    if (PAUSED_TEXT.test(subject)) return "paused";
    return NETWORK_TEXT.test(subject) ? "unreachable" : null;
  }

  let sawUnreachable = false;
  for (const current of chain(subject)) {
    const status = statusOf(current);
    const haystack = `${text(current["message"])} ${text(current["details"])} ${text(current["hint"])}`;

    if (status === PAUSED_STATUS || PAUSED_TEXT.test(haystack)) return "paused";

    if (status !== undefined && (status === 0 || status >= 500)) sawUnreachable = true;
    if (NETWORK_ERROR_NAMES.has(text(current["name"]))) sawUnreachable = true;
    if (NETWORK_CODES.has(text(current["code"]))) sawUnreachable = true;
    if (POSTGREST_CONNECTION_CODES.has(text(current["code"]))) sawUnreachable = true;
    // Text heuristics only for errors without a database/PostgREST code (those are application
    // errors, e.g. SQLSTATE 57014 "statement timeout") and without an HTTP status.
    const code = text(current["code"]);
    const hasApplicationCode = code !== "" && !NETWORK_CODES.has(code);
    if (status === undefined && !hasApplicationCode && NETWORK_TEXT.test(haystack)) {
      sawUnreachable = true;
    }
  }
  return sawUnreachable ? "unreachable" : null;
}
