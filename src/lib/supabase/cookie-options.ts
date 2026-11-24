import type { Env } from "@/lib/app-config";

/**
 * Options of the Supabase auth cookies (code-14 REV-1, risk R26). The browser never needs to read
 * the session (there is no browser Supabase client: the app talks to Supabase from the server), so
 * the cookies are `httpOnly`: an XSS can act inside the page but cannot steal the refresh token.
 * `secure` whenever the site is served over https (Vercel or an https site URL); plain http keeps
 * working locally and in e2e.
 */
export function authCookieOptions(env: Env = process.env) {
  const secure =
    Boolean(env["VERCEL"]) || (env["NEXT_PUBLIC_SITE_URL"] ?? "").startsWith("https://");
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure };
}
