import "server-only";
import { readSupabaseSecretKey } from "@/lib/app-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { rsvpIpKey } from "./limiter";
import { hashRsvpToken, isRsvpTokenShape } from "./token";

/**
 * The public RSVP edge to the database (ADR-0003, fifth scope of `admin.ts`): ONLY `rsvp_gate`,
 * `rsvp_page` and `rsvp_submit`, all `service_role`-only. Rules:
 *   - every result is a closed state; Postgres messages, codes, token, hash, IP and answers are
 *     NEVER returned or logged (REV-2: any error that is not `invalid_answers`, NUL included, is the
 *     generic `retry`);
 *   - a malformed token never reaches the DB (QA-15); a well-formed unknown one does (and counts);
 *   - `now` comes from the caller (`resolveNow()` on the request cookie, QA-1), never from the client;
 *   - no IP gives `p_ip_key: null`, passed explicitly (`rsvp_submit` has no default): no IP limit (P5).
 */

export type RsvpPerson = {
  id: string;
  first_name: string;
  last_name: string | null;
  category: "adult" | "child" | "infant";
  status: "yes" | "no" | null;
  diet: string[];
  diet_note: string | null;
  answered_at: string | null;
};

export type RsvpPageData = {
  couple: [string | null, string | null];
  date: string | null;
  location: { name: string; comune: string | null } | null;
  theme_id: string | null;
  people: RsvpPerson[];
};

/** One answer as the form sends it; `status: null` = no choice (nothing is written). */
export type RsvpAnswer = {
  id: string;
  status: "yes" | "no" | null;
  diet: string[];
  diet_note: string | null;
  seen_at: string | null;
};

export type GateResult = { blocked: boolean; retryAfterSeconds: number; themeId: string | null };

/** `neutral` = the one answer for every link that does not work; `retry` = infrastructure, try again. */
export type PageResult = { state: "ok"; page: RsvpPageData } | { state: "neutral" } | { state: "retry" };

export type SubmitResult =
  | { state: "ok"; people: RsvpPerson[]; changedMeanwhile: string[] }
  | { state: "neutral" }
  | { state: "blocked"; retryAfterSeconds: number }
  | { state: "invalid" }
  | { state: "retry" };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function ipKeyFor(ip: string | null): string | null {
  return ip === null ? null : rsvpIpKey(readSupabaseSecretKey(), ip);
}

/** The only error that is forwarded as a state: a bad payload on a working link. */
function isInvalidAnswers(error: { code?: string; message?: string }): boolean {
  return error.code === "P0001" && error.message === "invalid_answers";
}

/**
 * Proxy step (AC10): is this IP blocked, and which theme does a working link have? `null` on any
 * failure or timeout (the proxy then lets the request through: the page decides anyway).
 */
export async function rsvpGate(input: {
  token: string;
  ip: string | null;
  now: Date;
  timeoutMs: number;
}): Promise<GateResult | null> {
  if (!isRsvpTokenShape(input.token)) return null;
  try {
    const { data, error } = await createAdminClient()
      .rpc("rsvp_gate", {
        p_token_hash: hashRsvpToken(input.token),
        p_ip_key: ipKeyFor(input.ip) ?? undefined,
        p_now: input.now.toISOString(),
      })
      .abortSignal(AbortSignal.timeout(input.timeoutMs));
    if (error || !isObj(data)) return null;
    const seconds = Number(data["retry_after_seconds"]);
    return {
      blocked: data["blocked"] === true,
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0,
      themeId: typeof data["theme_id"] === "string" ? data["theme_id"] : null,
    };
  } catch {
    return null;
  }
}

/** Page load (T7). A failed or odd answer is `retry`, never an exception and never a message. */
export async function rsvpLoadPage(input: {
  token: string;
  ip: string | null;
  now: Date;
}): Promise<PageResult> {
  if (!isRsvpTokenShape(input.token)) return { state: "neutral" };
  try {
    const { data, error } = await createAdminClient().rpc("rsvp_page", {
      p_token_hash: hashRsvpToken(input.token),
      p_ip_key: ipKeyFor(input.ip) ?? undefined,
      p_now: input.now.toISOString(),
    });
    if (error || !isObj(data)) return { state: "retry" };
    if (data["ok"] === false) return { state: "neutral" };
    if (data["ok"] !== true || !Array.isArray(data["people"]) || !Array.isArray(data["couple"])) {
      return { state: "retry" };
    }
    return { state: "ok", page: data as unknown as RsvpPageData };
  } catch {
    return { state: "retry" };
  }
}

/** Submit (T7). `answers` is passed as is: the DB validates it as a whole before writing anything. */
export async function rsvpSubmit(input: {
  token: string;
  ip: string | null;
  answers: RsvpAnswer[];
  now: Date;
}): Promise<SubmitResult> {
  if (!isRsvpTokenShape(input.token)) return { state: "neutral" };
  try {
    const { data, error } = await createAdminClient().rpc("rsvp_submit", {
      p_token_hash: hashRsvpToken(input.token),
      // No default in SQL: an absent IP is an explicit null (no per-IP limit). The generated type
      // says `string`; the SQL parameter accepts null.
      p_ip_key: ipKeyFor(input.ip) as string,
      p_answers: input.answers,
      p_now: input.now.toISOString(),
    });
    if (error) return isInvalidAnswers(error) ? { state: "invalid" } : { state: "retry" };
    if (!isObj(data)) return { state: "retry" };
    if (data["ok"] === true) {
      const changed = data["changed_meanwhile"];
      if (!Array.isArray(data["people"]) || !Array.isArray(changed)) return { state: "retry" };
      return {
        state: "ok",
        people: data["people"] as RsvpPerson[],
        changedMeanwhile: changed.filter((id): id is string => typeof id === "string"),
      };
    }
    if (data["blocked"] === true) {
      const seconds = Number(data["retry_after_seconds"]);
      return {
        state: "blocked",
        retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0,
      };
    }
    return data["ok"] === false ? { state: "neutral" } : { state: "retry" };
  } catch {
    return { state: "retry" };
  }
}
