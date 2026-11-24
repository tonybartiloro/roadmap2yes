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

const NO_REFERRER_PREFIXES = ["/invito", "/auth", "/email"];

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
  return respond(decision, request, forwarded, cookiesToSet);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets (never under /api: it always goes
    // through the guards).
    "/((?!_next/static|_next/image|favicon.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
