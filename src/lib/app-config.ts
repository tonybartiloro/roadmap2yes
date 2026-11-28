import { z } from "zod";

/**
 * Typed, validated reading of the runtime configuration (plan §4.2, §4.3, §7, §11).
 *
 * - Every reader takes `env` as a parameter (default `process.env`) so it is unit-testable.
 * - Server code must read env at RUNTIME (bracket access on `process.env`), never through a
 *   `NEXT_PUBLIC_*` literal that the bundler would inline at build time: that is what lets the
 *   same build run with different configuration (e.g. e2e `degraded` / `email-off` servers).
 * - Errors describe WHICH variable is wrong, never its value (secrets, access codes).
 */
export type Env = Readonly<Record<string, string | undefined>>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// ---------------------------------------------------------------- Supabase

export type SupabasePublicConfig = { url: string; publishableKey: string };

/** URL + publishable key (server side, runtime). Throws a value-free error if missing. */
export function readSupabasePublicConfig(env: Env = process.env): SupabasePublicConfig {
  const url = clean(env["NEXT_PUBLIC_SUPABASE_URL"]);
  const publishableKey = clean(env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  const missing = [
    url ? null : "NEXT_PUBLIC_SUPABASE_URL",
    publishableKey ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name): name is string => name !== null);
  if (!url || !publishableKey) {
    throw new Error(`Missing Supabase configuration: ${missing.join(", ")}`);
  }
  return { url, publishableKey };
}

/** The secret key (server-only, only used by `lib/supabase/admin.ts`). */
export function readSupabaseSecretKey(env: Env = process.env): string {
  const key = clean(env["SUPABASE_SECRET_KEY"]);
  if (!key) throw new Error("Missing Supabase configuration: SUPABASE_SECRET_KEY");
  return key;
}

// ---------------------------------------------------------------- Email

export type EmailConfig =
  | { transport: "none"; enabled: false; reason?: string }
  | { transport: "smtp"; enabled: true; host: string; port: number }
  | { transport: "resend"; enabled: true; apiKey: string; from: string };

/**
 * Inputs of the single email switch `emailEnabled()` (T6, plan §7): enabled only for
 * `resend` with `RESEND_API_KEY` and `EMAIL_FROM`, or `smtp` with `SMTP_HOST`.
 * Absent / `none` / unknown / incomplete means NO email (never an exception: login must work).
 */
export function readEmailConfig(env: Env = process.env): EmailConfig {
  const transport = clean(env["EMAIL_TRANSPORT"])?.toLowerCase();
  if (transport === undefined || transport === "none") return { transport: "none", enabled: false };

  if (transport === "smtp") {
    const host = clean(env["SMTP_HOST"]);
    if (!host) return { transport: "none", enabled: false, reason: "SMTP_HOST missing" };
    const rawPort = clean(env["SMTP_PORT"]);
    const port = rawPort === undefined ? 1025 : Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { transport: "none", enabled: false, reason: "SMTP_PORT invalid" };
    }
    return { transport: "smtp", enabled: true, host, port };
  }

  if (transport === "resend") {
    const apiKey = clean(env["RESEND_API_KEY"]);
    const from = clean(env["EMAIL_FROM"]);
    if (!apiKey || !from) {
      return {
        transport: "none",
        enabled: false,
        reason: `${apiKey ? "" : "RESEND_API_KEY "}${from ? "" : "EMAIL_FROM "}missing`.trim(),
      };
    }
    return { transport: "resend", enabled: true, apiKey, from };
  }

  return { transport: "none", enabled: false, reason: "EMAIL_TRANSPORT unknown" };
}

export type EmailCaps = { daily: number; monthly: number };

function positiveInt(value: string | undefined, fallback: number): number {
  const raw = clean(value);
  if (raw === undefined || !/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Daily / monthly sending caps (defaults 50 / 1500). */
export function readEmailCaps(env: Env = process.env): EmailCaps {
  return {
    daily: positiveInt(env["EMAIL_DAILY_CAP"], 50),
    monthly: positiveInt(env["EMAIL_MONTHLY_CAP"], 1500),
  };
}

// ---------------------------------------------------------------- Bootstrap (first user)

export const BOOTSTRAP_ROLES = ["sposo", "sposa"] as const;
export type BootstrapRole = (typeof BOOTSTRAP_ROLES)[number];

export type BootstrapConfig =
  /** At least one of the three variables is missing: do nothing (plan §4.2). */
  | { status: "absent" }
  /** All present but invalid: configuration error, create nothing. `issues` = variable names only. */
  | { status: "invalid"; issues: string[] }
  | { status: "ok"; email: string; accessCode: string; role: BootstrapRole };

const emailSchema = z.string().max(254).pipe(z.email());

/** Normalised email used for every comparison (login vs bootstrap email). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Parses `R2Y_BOOTSTRAP_EMAIL|ACCESS_CODE|ROLE`. The access-code POLICY (length, weak list, …)
 * is checked by `features/auth/bootstrap.ts` with `lib/access-code.ts`; here only presence,
 * email shape and role are validated. The code is returned verbatim, never logged.
 */
export function readBootstrapConfig(env: Env = process.env): BootstrapConfig {
  const email = clean(env["R2Y_BOOTSTRAP_EMAIL"]);
  // The access code is NOT trimmed: it is a secret and spaces could be intentional.
  const accessCode = env["R2Y_BOOTSTRAP_ACCESS_CODE"];
  const role = clean(env["R2Y_BOOTSTRAP_ROLE"]);
  if (!email || !accessCode || !role) return { status: "absent" };

  const issues: string[] = [];
  if (!emailSchema.safeParse(normalizeEmail(email)).success) issues.push("R2Y_BOOTSTRAP_EMAIL");
  if (!(BOOTSTRAP_ROLES as readonly string[]).includes(role)) issues.push("R2Y_BOOTSTRAP_ROLE");
  if (issues.length > 0) return { status: "invalid", issues };

  return {
    status: "ok",
    email: normalizeEmail(email),
    accessCode,
    role: role as BootstrapRole,
  };
}

// ---------------------------------------------------------------- Login limiter

export type LoginLimits = {
  maxFailuresPerEmail: number;
  maxFailuresPerIp: number;
  lockMinutes: number;
  /** The counting window equals the lock duration ("5 errors in 15 minutes → lock 15 minutes"). */
  windowMinutes: number;
};

/** Defaults 5 / 20 / 15; a missing, non-numeric or non-positive value falls back to the default. */
export function readLoginLimits(env: Env = process.env): LoginLimits {
  const lockMinutes = positiveInt(env["R2Y_LOGIN_LOCK_MINUTES"], 15);
  return {
    maxFailuresPerEmail: positiveInt(env["R2Y_LOGIN_MAX_FAILURES_EMAIL"], 5),
    maxFailuresPerIp: positiveInt(env["R2Y_LOGIN_MAX_FAILURES_IP"], 20),
    lockMinutes,
    windowMinutes: lockMinutes,
  };
}

// ---------------------------------------------------------------- Misc

/**
 * Public site URL (links in emails, redirects).
 * Order: `NEXT_PUBLIC_SITE_URL`; on Vercel Production `VERCEL_PROJECT_PRODUCTION_URL`; on Vercel
 * Preview `VERCEL_BRANCH_URL`. In any production runtime without a usable value it THROWS (a
 * silent localhost link in an invitation email would be worse). Localhost only in dev/test.
 */
export function readSiteUrl(env: Env = process.env): string {
  const strip = (url: string) => url.replace(/\/+$/, "");
  const explicit = clean(env["NEXT_PUBLIC_SITE_URL"]);
  if (explicit) return strip(explicit);

  const vercelEnv = clean(env["VERCEL_ENV"]);
  if (vercelEnv === "production") {
    const host = clean(env["VERCEL_PROJECT_PRODUCTION_URL"]);
    if (host) return strip(`https://${host}`);
  } else if (vercelEnv === "preview") {
    const host = clean(env["VERCEL_BRANCH_URL"]);
    if (host) return strip(`https://${host}`);
  }

  if (vercelEnv !== undefined || env["NODE_ENV"] === "production") {
    throw new Error("Missing site configuration: NEXT_PUBLIC_SITE_URL");
  }
  return "http://localhost:3000";
}

export const MIN_RSVP_LINK_SECRET_LENGTH = 32;
/** The public fake secret of `.env.example`, CI, Vitest and the local seed: never valid in production. */
export const FAKE_RSVP_LINK_SECRET = "local-fake-rsvp-secret-0123456789abcdef";

/**
 * Secret of the RSVP link tokens (ADR-0003). Throws a value-free error when missing, shorter than
 * 32 characters, or the public fake value on any Vercel environment (the repo is public).
 */
export function readRsvpLinkSecret(env: Env = process.env): string {
  const secret = clean(env["RSVP_LINK_SECRET"]);
  if (!secret || secret.length < MIN_RSVP_LINK_SECRET_LENGTH) {
    throw new Error(
      `Missing or too short RSVP configuration: RSVP_LINK_SECRET (min ${MIN_RSVP_LINK_SECRET_LENGTH} chars)`,
    );
  }
  // Any Vercel environment (production, preview): CI, e2e and local runs do not set VERCEL_ENV.
  if (secret === FAKE_RSVP_LINK_SECRET && clean(env["VERCEL_ENV"]) !== undefined) {
    throw new Error("Invalid RSVP configuration: RSVP_LINK_SECRET is the public fake value");
  }
  return secret;
}

/** Secrets for the cron route and email links: presence only is read here, never logged. */
export function readJobSecrets(env: Env = process.env): {
  cronSecret: string | undefined;
  emailLinkSecret: string | undefined;
} {
  return {
    cronSecret: clean(env["CRON_SECRET"]),
    emailLinkSecret: clean(env["EMAIL_LINK_SECRET"]),
  };
}
