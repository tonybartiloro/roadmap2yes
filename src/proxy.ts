import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicConfig } from "@/lib/app-config";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { classifyDbError } from "@/lib/supabase/errors";
import {
  evaluateGuards,
  type BackendStatus,
  type GuardClaims,
  type GuardDecision,
} from "@/features/auth/guards";
import { clientIp } from "@/features/auth/limiter-keys";
import { blockedHtml } from "@/features/rsvp/blocked-html";
import { neutralHtml } from "@/features/rsvp/neutral-html";
import { rsvpGate, rsvpLoadPage } from "@/features/rsvp/public-rpc";
import { isRsvpTokenShape } from "@/features/rsvp/token";
import { resolveNow, TEST_NOW_COOKIE } from "@/lib/clock";
import { isApprovedThemeId } from "@/themes/approved";

/**
 * Edge of every request (Next 16 "proxy"): refreshes the Supabase session, resolves the claims
 * with `getClaims()`, delegates ALL routing rules to `features/auth/guards.ts` and applies the
 * decision. On network errors / HTTP 540 it rewrites to `/servizio` instead of redirecting to
 * the login (plan §4.7, DES-16). Authorization itself stays in the DB (RLS).
 */

/** Request header set on the outage rewrite to `/servizio` (read by `themes/server.ts`). */
const BACKEND_HEADER = "x-r2y-backend";

/** Total time allowed to the backend per proxied request (claims, refresh, guard lookups each). */
const BACKEND_TIMEOUT_MS = 3000;

/** Request header with the wedding theme of a working RSVP link (read by `themes/server.ts`). */
const THEME_HEADER = "x-r2y-theme";

const NO_REFERRER_PREFIXES = ["/invito", "/auth", "/email", "/rsvp"];

/** `/rsvp/{token}` (a trailing slash is a 308 redirect done by Next before the proxy). */
const RSVP_PATH = /^\/rsvp\/([^/]+)$/;

function referrerPolicyFor(pathname: string): string {
  const strict = NO_REFERRER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return strict ? "no-referrer" : "strict-origin-when-cross-origin";
}

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function decorate(response: NextResponse, pathname: string, cookies: CookieToSet[]): NextResponse {
  for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
  response.headers.set("Referrer-Policy", referrerPolicyFor(pathname));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/** The neutral 404: same bytes and headers for every cause (AC6). `decorate` adds no-store/no-referrer. */
function neutralResponse(): NextResponse {
  return new NextResponse(neutralHtml(), {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function respond(
  decision: GuardDecision,
  request: NextRequest,
  forwarded: Headers,
  cookies: CookieToSet[],
): NextResponse {
  const { pathname } = request.nextUrl;
  switch (decision.action) {
    case "redirect":
      return decorate(NextResponse.redirect(new URL(decision.to, request.url)), pathname, cookies);
    case "rewrite":
      return decorate(
        NextResponse.rewrite(new URL(decision.to, request.url), {
          request: { headers: forwarded },
        }),
        pathname,
        cookies,
      );
    case "deny":
      return decorate(new NextResponse(null, { status: decision.status }), pathname, cookies);
    case "next":
      return decorate(NextResponse.next({ request: { headers: forwarded } }), pathname, cookies);
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;
  const cookiesToSet: CookieToSet[] = [];
  const forwarded = new Headers(request.headers);
  // `x-r2y-backend` is proxy-owned (tells the root layout to skip the DB theme lookup on the
  // service page): never trust one sent by a client.
  // EXCEPT on /servizio itself: the outage rewrite runs the proxy a second time on that path and the
  // header set by the first pass must survive (it only skips a DB theme lookup: harmless if forged).
  const isServicePage = pathname === "/servizio";
  if (!isServicePage) forwarded.delete(BACKEND_HEADER);
  // `x-r2y-theme` is proxy-owned too: it makes the root layout paint a wedding's theme, so a client
  // can never send one. Only the RSVP gate below sets it, from the DB.
  forwarded.delete(THEME_HEADER);

  let claims: GuardClaims | null = null;
  let backend: BackendStatus = "ok";

  const { url, publishableKey } = readSupabasePublicConfig();
  const originalCookie = forwarded.get("cookie");
  // Every Supabase call of this request (claims, refresh, guard lookups) is bounded: a Vercel
  // function dies at 10 s, and auth-js retries a refused connection for ~50 s on its own.
  const abort = new AbortController();
  const boundedFetch: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any(
        [abort.signal, AbortSignal.timeout(BACKEND_TIMEOUT_MS), init?.signal].filter(
          (s): s is AbortSignal => Boolean(s),
        ),
      ),
    });
  const supabase = createServerClient(url, publishableKey, {
    global: { fetch: boundedFetch },
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        // Keep the refreshed session visible to the rest of this request AND send it back.
        for (const { name, value, options } of list) {
          request.cookies.set(name, value);
          cookiesToSet.push({ name, value, options });
        }
        forwarded.set("cookie", request.cookies.toString());
      },
    },
  });

  // The service page needs no session: asking the (down) backend again would cost the timeout twice.
  if (!isServicePage) {
    try {
      // Total cap on top of the per-call timeout: the retries inside auth-js cannot outlive it.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const capped = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(Object.assign(new Error("timeout"), { name: "TimeoutError" }));
        }, BACKEND_TIMEOUT_MS);
      });
      const { data, error } = await Promise.race([supabase.auth.getClaims(), capped]).finally(() =>
        clearTimeout(timer),
      );
      if (error) {
        const kind = classifyDbError(error);
        if (kind) backend = kind;
        // Any other auth error (missing/invalid session) means "not signed in".
      } else if (data?.claims) {
        claims = data.claims as GuardClaims;
      }
    } catch (error) {
      const kind = classifyDbError(error);
      if (kind) backend = kind;
      // Unknown failure: fail closed as "not signed in" (never expose private pages).
    }
  }

  if (backend !== "ok") {
    // An outage is not a logout: a failed refresh makes auth-js drop the session (e.g. on a 540),
    // and those cookie deletions must never reach the browser (the person is still signed in).
    cookiesToSet.length = 0;
    if (originalCookie === null) forwarded.delete("cookie");
    else forwarded.set("cookie", originalCookie);
  }

  const decision = await evaluateGuards({ pathname, searchParams, claims, backend, supabase });
  if (decision.action === "rewrite" && backend !== "ok") forwarded.set(BACKEND_HEADER, backend);

  // RSVP gate (AC10): only a well-formed token on a healthy backend and an allowed request. Bounded
  // and fail-open: if the gate does not answer, the page decides anyway.
  // GET/HEAD only: the submit is a server-action POST to the same path and must reach `rsvp_submit`,
  // which answers neutral/blocked by itself with a 200 the client can parse (ADR-0003 §6).
  const isPageLoad = request.method === "GET" || request.method === "HEAD";
  if (isPageLoad && decision.action === "next" && backend === "ok") {
    // Decode once, like the page does for `params`: gate and page must see the same token (REV-111).
    // A malformed escape is not a token: skip the gate, the page answers neutral.
    let token: string | undefined = RSVP_PATH.exec(pathname)?.[1];
    if (token !== undefined) {
      try {
        token = decodeURIComponent(token);
      } catch {
        token = undefined;
      }
    }
    // Malformed token (or broken escape) on `/rsvp/{x}`: the neutral 404, no DB (QA-15).
    if (RSVP_PATH.test(pathname) && (token === undefined || !isRsvpTokenShape(token))) {
      return decorate(neutralResponse(), pathname, cookiesToSet);
    }
    if (token !== undefined && isRsvpTokenShape(token)) {
      const ip = clientIp(request.headers);
      // QA-1: the only source of `p_now`; the cookie counts only with E2E_CLOCK and no VERCEL.
      const now = resolveNow({ cookieValue: request.cookies.get(TEST_NOW_COOKIE)?.value });
      const gate = await rsvpGate({ token, ip, now, timeoutMs: BACKEND_TIMEOUT_MS });
      if (gate?.blocked) {
        const blocked = new NextResponse(blockedHtml(), {
          status: 429,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Retry-After": String(Math.max(1, gate.retryAfterSeconds)),
            "X-Robots-Tag": "noindex, nofollow",
          },
        });
        return decorate(blocked, pathname, cookiesToSet);
      }
      const themeId = gate?.themeId;
      if (isApprovedThemeId(themeId)) forwarded.set(THEME_HEADER, themeId);
      // Gate answered "no theme" = a link that does not work (`weddings.theme_id` is not null): ask
      // the page RPC once (it counts the failed lookup, BR9) and answer the neutral 404 here, because
      // `notFound()` gives an empty body without JS. A working link never gets here, so the page's own
      // call stays the only one; `ok`, `retry` and a timeout let the request through (fail-open).
      if (gate !== null && gate.themeId === null) {
        const page = await rsvpLoadPage({ token, ip, now, timeoutMs: BACKEND_TIMEOUT_MS });
        if (page.state === "neutral") return decorate(neutralResponse(), pathname, cookiesToSet);
      }
    }
  }
  return respond(decision, request, forwarded, cookiesToSet);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets (never under /api: it always goes
    // through the guards).
    "/((?!_next/static|_next/image|favicon.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
