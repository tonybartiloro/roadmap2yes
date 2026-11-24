import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicConfig } from "@/lib/app-config";
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

  let claims: GuardClaims | null = null;
  let backend: BackendStatus = "ok";

  const { url, publishableKey } = readSupabasePublicConfig();
  const supabase = createServerClient(url, publishableKey, {
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

  try {
    const { data, error } = await supabase.auth.getClaims();
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

  const decision = await evaluateGuards({ pathname, searchParams, claims, backend, supabase });
  return respond(decision, request, forwarded, cookiesToSet);
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
