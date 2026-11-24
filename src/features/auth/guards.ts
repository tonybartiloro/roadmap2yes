/**
 * PLACEHOLDER owned by T7a (`src/features/auth/**`) — created by T1 ONLY so that `src/proxy.ts`
 * compiles. T7a replaces the body of `evaluateGuards` with the real rules (post-login order of
 * plan §4.3.4) and MUST keep the exported types and the function signature: they are the
 * contract between the proxy (T1) and the auth feature (T7a).
 *
 * Contract: the proxy resolves the session claims (`getClaims()`) and the backend status, then
 * asks `evaluateGuards` what to do. The proxy applies the decision, copies refreshed session
 * cookies and adds security headers; it never contains routing rules itself.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbErrorKind } from "@/lib/supabase/errors";

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
  "/servizio",
  "/robots.txt",
  "/manifest.webmanifest",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function evaluateGuards(ctx: GuardContext): Promise<GuardDecision> {
  const { pathname, claims, backend } = ctx;

  // Cron authenticates itself with CRON_SECRET inside the route handler.
  if (pathname.startsWith("/api/cron/")) return { action: "next" };

  // Infrastructure outage: never redirect to the login, show the service page (no DB access).
  if (backend !== "ok" && pathname !== "/servizio") {
    return { action: "rewrite", to: `/servizio?motivo=${backend}` };
  }

  if (claims === null) {
    if (isPublic(pathname)) return { action: "next" };
    if (pathname.startsWith("/api/")) return { action: "deny", status: 401 };
    return { action: "redirect", to: "/accesso" };
  }

  if (pathname === "/accesso") return { action: "redirect", to: "/" };
  return { action: "next" };
}
