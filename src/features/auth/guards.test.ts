import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { evaluateGuards, isPlainPath, type GuardClaims, type GuardContext } from "./guards";

function fakeDb(result: { data: unknown; error: unknown }) {
  const select = vi.fn(() => ({ limit: () => Promise.resolve(result) }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from };
}

const MEMBER = { data: [{ wedding_id: "w" }], error: null };
const NONE = { data: [], error: null };

function ctx(pathname: string, over: Partial<GuardContext> = {}): GuardContext {
  return {
    pathname,
    searchParams: new URLSearchParams(),
    claims: null,
    backend: "ok",
    supabase: fakeDb(MEMBER).client,
    ...over,
  };
}

const signedIn = (appMetadata?: Record<string, unknown>): GuardClaims => ({
  sub: "u1",
  ...(appMetadata ? { app_metadata: appMetadata } : {}),
});

describe("guards: no session", () => {
  it.each([
    "/accesso",
    "/auth/conferma",
    "/su-invito",
    "/invito/abc",
    "/servizio",
    "/email/disattiva",
    "/rsvp/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde",
  ])("lets the public page %s through", async (path) => {
    expect(await evaluateGuards(ctx(path))).toEqual({ action: "next" });
  });

  it("lets a signed-in member open the public RSVP page, and keeps /rsvp-like paths private", async () => {
    expect(await evaluateGuards(ctx("/rsvp/abc", { claims: signedIn() }))).toEqual({
      action: "next",
    });
    expect(await evaluateGuards(ctx("/rsvpx/abc"))).toEqual({ action: "redirect", to: "/accesso" });
    expect(await evaluateGuards(ctx("/rsvp/%2e%2e/percorso"))).toEqual({
      action: "redirect",
      to: "/accesso",
    });
  });

  it.each(["/", "/percorso", "/altro/account", "/onboarding"])(
    "redirects the private page %s to the login",
    async (path) => {
      expect(await evaluateGuards(ctx(path))).toEqual({ action: "redirect", to: "/accesso" });
    },
  );

  it("refuses data APIs with 401 and no body", async () => {
    expect(await evaluateGuards(ctx("/api/export"))).toEqual({ action: "deny", status: 401 });
  });

  it("does not guard the cron route (it checks its own secret)", async () => {
    expect(await evaluateGuards(ctx("/api/cron/daily"))).toEqual({ action: "next" });
  });

  // code-1 N6: a public prefix must never be borrowed by a clever path.
  it.each([
    "/accesso/%2e%2e/percorso",
    "/accesso/%2E%2E/percorso",
    "/accesso/../percorso",
    "/accesso/./x",
    "/accesso/%2fx",
    "/accesso/%5cx",
    "/accesso\\..\\x",
    "/accesso//x",
    "/auth/%2e%2e/altro",
    "/invito/%E0%A4%A",
  ])("treats the dot-segment / encoded path %s as private", async (path) => {
    expect(isPlainPath(path)).toBe(false);
    expect(await evaluateGuards(ctx(path))).toEqual({ action: "redirect", to: "/accesso" });
  });

  it("accepts ordinary public sub-paths", () => {
    expect(isPlainPath("/invito/abc-123_x")).toBe(true);
    expect(isPlainPath("/auth/conferma")).toBe(true);
  });
});

describe("guards: backend outage", () => {
  it("rewrites to the service page instead of redirecting to the login", async () => {
    expect(await evaluateGuards(ctx("/percorso", { backend: "paused" }))).toEqual({
      action: "rewrite",
      to: "/servizio?motivo=paused",
    });
    expect(await evaluateGuards(ctx("/accesso", { backend: "unreachable" }))).toEqual({
      action: "rewrite",
      to: "/servizio?motivo=unreachable",
    });
  });

  it("rewrites when the membership lookup meets an outage", async () => {
    const db = fakeDb({ data: null, error: { status: 540, message: "" } });
    expect(
      await evaluateGuards(ctx("/percorso", { claims: signedIn(), supabase: db.client })),
    ).toEqual({ action: "rewrite", to: "/servizio?motivo=paused" });
  });
});

describe("guards: signed in", () => {
  it("sends the login page to the home", async () => {
    expect(await evaluateGuards(ctx("/accesso", { claims: signedIn() }))).toEqual({
      action: "redirect",
      to: "/",
    });
  });

  it("lets a member through to private pages and runs one membership query", async () => {
    const db = fakeDb(MEMBER);
    const decision = await evaluateGuards(
      ctx("/budget", { claims: signedIn(), supabase: db.client }),
    );
    expect(decision).toEqual({ action: "next" });
    expect(db.from).toHaveBeenCalledWith("memberships");
  });

  it("sends someone without a space to the post-login steps", async () => {
    const db = fakeDb(NONE);
    expect(await evaluateGuards(ctx("/", { claims: signedIn(), supabase: db.client }))).toEqual({
      action: "redirect",
      to: "/auth/avanti",
    });
  });

  it("does not loop: the post-login route and the 'su invito' page are reachable without a space", async () => {
    const db = fakeDb(NONE);
    const base = { claims: signedIn(), supabase: db.client };
    expect(await evaluateGuards(ctx("/auth/avanti", base))).toEqual({ action: "next" });
    expect(await evaluateGuards(ctx("/su-invito", base))).toEqual({ action: "next" });
  });

  it("sends a member away from 'su invito'", async () => {
    expect(await evaluateGuards(ctx("/su-invito", { claims: signedIn() }))).toEqual({
      action: "redirect",
      to: "/",
    });
  });

  it("keeps a pending temporary code on /altro/account (no query needed)", async () => {
    const db = fakeDb(MEMBER);
    const claims = signedIn({ r2y_must_change_code: true });
    expect(await evaluateGuards(ctx("/percorso", { claims, supabase: db.client }))).toEqual({
      action: "redirect",
      to: "/altro/account?obbligatorio=1",
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(await evaluateGuards(ctx("/altro/account", { claims, supabase: db.client }))).toEqual({
      action: "next",
    });
  });

  it("a flag is not a way to dodge the path check: an encoded account path is still redirected", async () => {
    const claims = signedIn({ r2y_must_change_code: true });
    expect(await evaluateGuards(ctx("/altro/account/%2e%2e/percorso", { claims }))).toEqual({
      action: "redirect",
      to: "/altro/account?obbligatorio=1",
    });
  });

  it("the flag only counts when it is exactly true", async () => {
    const claims = signedIn({ r2y_must_change_code: "true" });
    expect(await evaluateGuards(ctx("/percorso", { claims }))).toEqual({ action: "next" });
  });
});
