/**
 * Routing rules of the proxy (plan §4.3, §4.7). `src/proxy.ts` resolves the session claims
 * (`getClaims()`) and the backend status, asks `evaluateGuards` what to do, applies the decision,
 * copies refreshed session cookies and adds security headers; it never contains routing rules.
 * The exported types and the `evaluateGuards` signature are the contract between the proxy (T1)
 * and the auth feature (T7a): keep them.
 *
 * Authorization itself is NOT here (RLS owns it): these are optimistic checks that decide where a
 * request goes. Rules for a signed-in user, in order:
 *   1. a temporary code is pending (`app_metadata.r2y_must_change_code`, from the JWT, no query)
 *      -> only `/altro/account` (and the public pages) until the code is changed;
 *   2. no membership (one indexed query, RLS-scoped) -> `/auth/avanti`, which runs the post-login
 *      steps (accept an invitation / founder creates the space / "su invito");
 *   3. a member never sees `/accesso` or `/su-invito`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyDbError, type DbErrorKind } from "@/lib/supabase/errors";
import { ACCOUNT_FORCED_PATH, HOME_PATH, INVITE_ONLY_PATH, mustChangeCode } from "./post-login";

/** Verified JWT claims (`sub`, `app_metadata`, …) or `null` when there is no valid session. */
export type GuardClaims = { sub: string; app_metadata?: Record<string, unknown> } & Record<
  string,
  unknown
>;

/** `ok`, or the infrastructure outage detected while resolving the session (DES-16). */
export type BackendStatus = "ok" | DbErrorKind;

export type GuardContext = {
  pathname: string;
  searchParams: URLSearchParams;
  claims: GuardClaims | null;
  backend: BackendStatus;
  /** Client bound to the request cookies (user JWT) for membership / invitation lookups. */
  supabase: SupabaseClient;
};

export type GuardDecision =
  | { action: "next" }
  | { action: "redirect"; to: string }
  /** Internal rewrite (the URL in the browser does not change), e.g. to `/servizio?motivo=paused`. */
  | { action: "rewrite"; to: string }
  /** Data APIs without a session: refuse with this status and no body. */
  | { action: "deny"; status: 401 | 403 };

const PUBLIC_PREFIXES = [
  "/accesso",
  "/auth",
  "/invito",
  "/su-invito",
  "/email",
  "/rsvp",
  "/servizio",
  "/robots.txt",
  "/manifest.webmanifest",
];

const LOGIN_PATH = "/accesso";
const AFTER_LOGIN_PATH = "/auth/avanti";
const ACCOUNT_PATH = "/altro/account";

/**
 * A path is only trusted as public when it is plain: no dot segments, no encoded dots, slashes or
 * backslashes, no empty segments. Anything else (`/accesso/%2e%2e/x`, `/accesso/../x`) is treated as
 * a PRIVATE path, so a clever URL can never borrow the public prefix. (`URL` already folds these
 * in the proxy; the guard does not rely on it.)
 */
export function isPlainPath(pathname: string): boolean {
  if (!hasPlainShape(pathname)) return false;
  try {
    decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return true;
}

function hasPlainShape(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (/%(2e|2f|5c)/i.test(pathname) || pathname.includes("\\") || pathname.includes("//")) {
    return false;
  }
  return !pathname.split("/").some((segment) => segment === "." || segment === "..");
}

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublic(pathname: string): boolean {
  // `/rsvp/{token}`: a broken percent escape is not a way to borrow the prefix (the shape checks
  // still apply) and must reach the proxy, which answers the neutral 404 without DB (QA-A).
  const plain = under(pathname, "/rsvp") ? hasPlainShape(pathname) : isPlainPath(pathname);
  return plain && PUBLIC_PREFIXES.some((prefix) => under(pathname, prefix));
}

type MembershipLookup = "member" | "none" | DbErrorKind | "unknown";

async function lookupMembership(supabase: SupabaseClient): Promise<MembershipLookup> {
  try {
    const { data, error } = await supabase.from("memberships").select("wedding_id").limit(1);
    if (error) return classifyDbError(error) ?? "unknown";
    return Array.isArray(data) && data.length > 0 ? "member" : "none";
  } catch (error) {
    return classifyDbError(error) ?? "unknown";
  }
}

export async function evaluateGuards(ctx: GuardContext): Promise<GuardDecision> {
  const { pathname, claims, backend } = ctx;

  // Cron authenticates itself with CRON_SECRET inside the route handler.
  if (isPlainPath(pathname) && pathname.startsWith("/api/cron/")) return { action: "next" };

  // Infrastructure outage: never redirect to the login, show the service page (no DB access).
  if (backend !== "ok" && pathname !== "/servizio") {
    return { action: "rewrite", to: `/servizio?motivo=${backend}` };
  }

  if (claims === null) {
    if (isPublic(pathname)) return { action: "next" };
    if (pathname.startsWith("/api/")) return { action: "deny", status: 401 };
    return { action: "redirect", to: LOGIN_PATH };
  }

  // Signed in from here on.
  if (pathname === LOGIN_PATH) return { action: "redirect", to: HOME_PATH };
  if (pathname.startsWith("/api/")) return { action: "next" };

  if (isPublic(pathname) && !under(pathname, INVITE_ONLY_PATH)) return { action: "next" };

  if (under(pathname, INVITE_ONLY_PATH)) {
    const found = await lookupMembership(ctx.supabase);
    if (found === "paused" || found === "unreachable") {
      return { action: "rewrite", to: `/servizio?motivo=${found}` };
    }
    return found === "member" ? { action: "redirect", to: HOME_PATH } : { action: "next" };
  }

  // Private page. NOTE (code-14 REV-9): the forced change is a ROUTING rule for navigation. A user
  // with the flag can still call another server action by id; there is no authorization hole (RLS
  // owns authorization, the flag only forces replacing a code the partner knows).
  if (
    mustChangeCode(claims.app_metadata) &&
    !(isPlainPath(pathname) && under(pathname, ACCOUNT_PATH))
  ) {
    return { action: "redirect", to: ACCOUNT_FORCED_PATH };
  }

  const found = await lookupMembership(ctx.supabase);
  if (found === "paused" || found === "unreachable") {
    return { action: "rewrite", to: `/servizio?motivo=${found}` };
  }
  if (found === "none") return { action: "redirect", to: AFTER_LOGIN_PATH };
  return { action: "next" };
}
