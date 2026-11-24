import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function supabaseOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * NOTE: `connect-src` uses the Supabase origin known at BUILD time; a runtime override of the
 * backend URL (e.g. the e2e `degraded` server) leaves it stale. Harmless: that server never
 * reaches a working backend anyway.
 * Base CSP (plan §4.7): no nonce in R1 (follow-up in ADR-0001), so inline scripts/styles that
 * Next.js emits are allowed; everything else is same-origin, plus the Supabase API for the browser
 * client. `frame-ancestors 'none'` forbids embedding.
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const connect = ["'self'", ...(supabase ? [supabase] : []), ...(isDev ? ["ws:", "http:"] : [])];
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only on Vercel: local/e2e servers talk plain http to 127.0.0.1.
    ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

// `Referrer-Policy` is set in src/proxy.ts (no-referrer on /invito/*, /auth/*, /email/*,
// strict-origin-when-cross-origin elsewhere) so the value is never duplicated here.
const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
