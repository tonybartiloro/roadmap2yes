import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  readBootstrapConfig,
  readEmailCaps,
  readEmailConfig,
  readLoginLimits,
  readRsvpLinkSecret,
  FAKE_RSVP_LINK_SECRET,
  readSiteUrl,
  readSupabasePublicConfig,
  readSupabaseSecretKey,
} from "./app-config";

describe("readEmailConfig (inputs of emailEnabled)", () => {
  it.each([
    ["absent", {}],
    ["empty", { EMAIL_TRANSPORT: "  " }],
    ["none", { EMAIL_TRANSPORT: "none" }],
    ["NONE (case)", { EMAIL_TRANSPORT: "NONE" }],
  ])("%s means no email", (_n, env) => {
    expect(readEmailConfig(env)).toEqual({ transport: "none", enabled: false });
  });

  it("resend without key is disabled, with a reason that names variables only", () => {
    const config = readEmailConfig({ EMAIL_TRANSPORT: "resend", EMAIL_FROM: "a@example.test" });
    expect(config).toMatchObject({
      transport: "none",
      enabled: false,
      reason: "RESEND_API_KEY missing",
    });
  });

  it("resend without EMAIL_FROM is disabled", () => {
    expect(readEmailConfig({ EMAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_fake" })).toMatchObject(
      { enabled: false, reason: "EMAIL_FROM missing" },
    );
  });

  it("resend complete is enabled", () => {
    expect(
      readEmailConfig({
        EMAIL_TRANSPORT: "resend",
        RESEND_API_KEY: "re_fake",
        EMAIL_FROM: "x@example.test",
      }),
    ).toEqual({ transport: "resend", enabled: true, apiKey: "re_fake", from: "x@example.test" });
  });

  it("smtp with host is enabled (default port 1025)", () => {
    expect(readEmailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1" })).toEqual({
      transport: "smtp",
      enabled: true,
      host: "127.0.0.1",
      port: 1025,
    });
  });

  it("smtp honours SMTP_PORT and rejects an invalid one", () => {
    expect(
      readEmailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "h", SMTP_PORT: "54425" }),
    ).toMatchObject({ enabled: true, port: 54425 });
    for (const port of ["0", "70000", "abc", "1.5"]) {
      expect(
        readEmailConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "h", SMTP_PORT: port }),
      ).toMatchObject({ enabled: false, reason: "SMTP_PORT invalid" });
    }
  });

  it("smtp without host is disabled", () => {
    expect(readEmailConfig({ EMAIL_TRANSPORT: "smtp" })).toMatchObject({ enabled: false });
  });

  it("an unknown transport is disabled", () => {
    expect(readEmailConfig({ EMAIL_TRANSPORT: "sendgrid" })).toMatchObject({
      enabled: false,
      reason: "EMAIL_TRANSPORT unknown",
    });
  });
});

describe("readEmailCaps", () => {
  it("defaults to 50/1500", () => {
    expect(readEmailCaps({})).toEqual({ daily: 50, monthly: 1500 });
  });
  it("reads valid values and ignores invalid ones", () => {
    expect(readEmailCaps({ EMAIL_DAILY_CAP: "10", EMAIL_MONTHLY_CAP: "200" })).toEqual({
      daily: 10,
      monthly: 200,
    });
    expect(readEmailCaps({ EMAIL_DAILY_CAP: "0", EMAIL_MONTHLY_CAP: "-5" })).toEqual({
      daily: 50,
      monthly: 1500,
    });
    expect(readEmailCaps({ EMAIL_DAILY_CAP: "x", EMAIL_MONTHLY_CAP: "1e3" })).toEqual({
      daily: 50,
      monthly: 1500,
    });
  });
});

describe("readBootstrapConfig", () => {
  const full = {
    R2Y_BOOTSTRAP_EMAIL: "  Tony@Example.test ",
    R2Y_BOOTSTRAP_ACCESS_CODE: "fake-code-0123",
    R2Y_BOOTSTRAP_ROLE: "sposo",
  };

  it("is absent when no variable is set", () => {
    expect(readBootstrapConfig({})).toEqual({ status: "absent" });
  });

  it.each(["R2Y_BOOTSTRAP_EMAIL", "R2Y_BOOTSTRAP_ACCESS_CODE", "R2Y_BOOTSTRAP_ROLE"])(
    "is absent when %s is missing",
    (name) => {
      const env: Record<string, string | undefined> = { ...full };
      delete env[name];
      expect(readBootstrapConfig(env)).toEqual({ status: "absent" });
    },
  );

  it("normalises the email and returns the code untouched", () => {
    expect(readBootstrapConfig(full)).toEqual({
      status: "ok",
      email: "tony@example.test",
      accessCode: "fake-code-0123",
      role: "sposo",
    });
  });

  it("accepts sposa", () => {
    expect(readBootstrapConfig({ ...full, R2Y_BOOTSTRAP_ROLE: "sposa" })).toMatchObject({
      status: "ok",
      role: "sposa",
    });
  });

  it("flags invalid role and email by variable name only (no values)", () => {
    const result = readBootstrapConfig({
      ...full,
      R2Y_BOOTSTRAP_EMAIL: "not-an-email",
      R2Y_BOOTSTRAP_ROLE: "marito",
    });
    expect(result).toEqual({
      status: "invalid",
      issues: ["R2Y_BOOTSTRAP_EMAIL", "R2Y_BOOTSTRAP_ROLE"],
    });
    expect(JSON.stringify(result)).not.toContain("fake-code-0123");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  A@Example.Test ")).toBe("a@example.test");
  });
});

describe("readLoginLimits", () => {
  it("defaults to 5 / 20 / 15", () => {
    expect(readLoginLimits({})).toEqual({
      maxFailuresPerEmail: 5,
      maxFailuresPerIp: 20,
      lockMinutes: 15,
      windowMinutes: 15,
    });
  });
  it("is configurable", () => {
    expect(
      readLoginLimits({
        R2Y_LOGIN_MAX_FAILURES_EMAIL: "3",
        R2Y_LOGIN_MAX_FAILURES_IP: "10",
        R2Y_LOGIN_LOCK_MINUTES: "30",
      }),
    ).toEqual({ maxFailuresPerEmail: 3, maxFailuresPerIp: 10, lockMinutes: 30, windowMinutes: 30 });
  });
  it("falls back to defaults on invalid values", () => {
    expect(
      readLoginLimits({
        R2Y_LOGIN_MAX_FAILURES_EMAIL: "0",
        R2Y_LOGIN_MAX_FAILURES_IP: "abc",
        R2Y_LOGIN_LOCK_MINUTES: "-1",
      }),
    ).toMatchObject({ maxFailuresPerEmail: 5, maxFailuresPerIp: 20, lockMinutes: 15 });
  });
});

describe("Supabase config", () => {
  it("reads url and publishable key", () => {
    expect(
      readSupabasePublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54421",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk",
      }),
    ).toEqual({ url: "http://127.0.0.1:54421", publishableKey: "pk" });
  });
  it("names the missing variables without values", () => {
    expect(() => readSupabasePublicConfig({})).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
    expect(() => readSupabaseSecretKey({})).toThrow("SUPABASE_SECRET_KEY");
  });
  it("reads the secret key", () => {
    expect(readSupabaseSecretKey({ SUPABASE_SECRET_KEY: "sk" })).toBe("sk");
  });
});

describe("readRsvpLinkSecret", () => {
  const real = "real-looking-secret-0123456789-abcdefghij";
  it("reads a secret of at least 32 characters", () => {
    expect(readRsvpLinkSecret({ RSVP_LINK_SECRET: ` ${real} ` })).toBe(real);
  });
  it("refuses a missing, empty or too short secret without echoing it", () => {
    expect(() => readRsvpLinkSecret({})).toThrow("RSVP_LINK_SECRET");
    expect(() => readRsvpLinkSecret({ RSVP_LINK_SECRET: "  " })).toThrow("RSVP_LINK_SECRET");
    expect(() => readRsvpLinkSecret({ RSVP_LINK_SECRET: "short-secret-value" })).toThrow(
      /^(?!.*short-secret-value).*RSVP_LINK_SECRET/,
    );
  });
  it("accepts the fake local secret outside Vercel (local, CI and e2e with NODE_ENV=production)", () => {
    const env = { RSVP_LINK_SECRET: FAKE_RSVP_LINK_SECRET };
    expect(readRsvpLinkSecret(env)).toBe(FAKE_RSVP_LINK_SECRET);
    expect(readRsvpLinkSecret({ ...env, NODE_ENV: "production" })).toBe(FAKE_RSVP_LINK_SECRET);
    expect(readRsvpLinkSecret({ ...env, VERCEL_ENV: "  " })).toBe(FAKE_RSVP_LINK_SECRET);
  });
  it("refuses the fake local secret on every Vercel environment", () => {
    for (const vercelEnv of ["production", "preview", "development"]) {
      expect(() =>
        readRsvpLinkSecret({ RSVP_LINK_SECRET: FAKE_RSVP_LINK_SECRET, VERCEL_ENV: vercelEnv }),
      ).toThrow("public fake value");
      expect(readRsvpLinkSecret({ RSVP_LINK_SECRET: real, VERCEL_ENV: vercelEnv })).toBe(real);
    }
  });
});

describe("readSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL and strips trailing slashes", () => {
    expect(
      readSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://x.example.test//",
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "p.example.test",
      }),
    ).toBe("https://x.example.test");
  });
  it("uses the production URL on Vercel Production, the branch URL on Preview", () => {
    expect(
      readSiteUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "p.example.test",
        VERCEL_BRANCH_URL: "b.example.test",
      }),
    ).toBe("https://p.example.test");
    expect(readSiteUrl({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "b.example.test" })).toBe(
      "https://b.example.test",
    );
  });
  it("never uses the preview alias in production", () => {
    expect(() =>
      readSiteUrl({ VERCEL_ENV: "production", VERCEL_BRANCH_URL: "b.example.test" }),
    ).toThrow("NEXT_PUBLIC_SITE_URL");
  });
  it("throws in a production runtime without a site URL", () => {
    expect(() => readSiteUrl({ NODE_ENV: "production" })).toThrow("NEXT_PUBLIC_SITE_URL");
    expect(() => readSiteUrl({ VERCEL_ENV: "preview" })).toThrow("NEXT_PUBLIC_SITE_URL");
  });
  it("falls back to localhost only in dev/test", () => {
    expect(readSiteUrl({})).toBe("http://localhost:3000");
    expect(readSiteUrl({ NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});
