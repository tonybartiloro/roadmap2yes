import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { resolvePostLogin } from "./post-login";

type Reply = { data: unknown; error: unknown };
type Script = {
  memberships: Reply[];
  weddings?: Reply;
  rpc?: Record<string, Reply>;
};

/** Scripted client: each membership read returns the next reply; rpc calls are recorded. */
function fakeDb(script: Script) {
  const calls: string[] = [];
  const filters: unknown[][] = [];
  let reads = 0;
  const client = {
    from(table: string) {
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            filters.push(args);
            return { limit: () => membershipReply() };
          },
          limit: () => (table === "memberships" ? membershipReply() : weddingReply()),
        }),
      };
    },
    rpc(name: string) {
      calls.push(name);
      return Promise.resolve(script.rpc?.[name] ?? { data: null, error: null });
    },
  } as unknown as SupabaseClient;
  function membershipReply() {
    const reply = script.memberships[Math.min(reads, script.memberships.length - 1)];
    reads += 1;
    return Promise.resolve(reply);
  }
  function weddingReply() {
    return Promise.resolve(script.weddings ?? { data: [], error: null });
  }
  return { client, calls, filters };
}

const go = (db: { client: SupabaseClient }, appMetadata: Record<string, unknown> = {}) =>
  resolvePostLogin(db.client, { id: "user-1", app_metadata: appMetadata });

const none: Reply = { data: [], error: null };
const slot = (s: "A" | "B"): Reply => ({ data: [{ partner_slot: s }], error: null });
const open: Reply = { data: [{ onboarding_completed_at: null }], error: null };
const done: Reply = { data: [{ onboarding_completed_at: "2026-12-01" }], error: null };

describe("resolvePostLogin", () => {
  it("looks only at the user's OWN membership (a member can read the whole wedding's)", async () => {
    const db = fakeDb({ memberships: [slot("A")], weddings: done });
    await go(db);
    expect(db.filters[0]).toEqual(["user_id", "user-1"]);
  });

  it("member A with the onboarding unfinished resumes it", async () => {
    const db = fakeDb({ memberships: [slot("A")], weddings: open });
    expect(await go(db)).toEqual({ status: "ok", to: "/onboarding" });
    expect(db.calls).toEqual(["sync_my_email"]);
  });

  it("member A with the onboarding done goes home", async () => {
    const db = fakeDb({ memberships: [slot("A")], weddings: done });
    expect(await go(db)).toEqual({ status: "ok", to: "/" });
  });

  it("partner B goes straight to the shared space, never to the onboarding", async () => {
    const db = fakeDb({ memberships: [slot("B")], weddings: open });
    expect(await go(db)).toEqual({ status: "ok", to: "/" });
  });

  it("accepts a pending invitation first, and never creates a space for the invitee", async () => {
    const db = fakeDb({
      memberships: [none, slot("B")],
      rpc: { accept_pending_invitation: { data: "ok", error: null } },
    });
    expect(await go(db)).toEqual({ status: "ok", to: "/" });
    expect(db.calls).not.toContain("create_wedding");
  });

  it("a founder without a space gets one and goes to the onboarding", async () => {
    const db = fakeDb({
      memberships: [none, slot("A")],
      weddings: open,
      rpc: { accept_pending_invitation: { data: "not_found", error: null } },
    });
    expect(await go(db, { r2y_founder: true })).toEqual({ status: "ok", to: "/onboarding" });
    expect(db.calls.slice(0, 2)).toEqual(["accept_pending_invitation", "create_wedding"]);
  });

  it("anyone else without a space goes to 'su invito' and nothing is created", async () => {
    const db = fakeDb({
      memberships: [none],
      rpc: { accept_pending_invitation: { data: "not_found", error: null } },
    });
    expect(await go(db, { r2y_founder: "true" })).toEqual({ status: "ok", to: "/su-invito" });
    expect(db.calls).toEqual(["accept_pending_invitation"]);
  });

  it("a refused create_wedding (pending invitation, already created) is an answer: 'su invito'", async () => {
    const db = fakeDb({
      memberships: [none],
      rpc: {
        accept_pending_invitation: { data: "revoked", error: null },
        create_wedding: { data: null, error: { code: "P0001", message: "pending_invitation" } },
      },
    });
    expect(await go(db, { r2y_founder: true })).toEqual({ status: "ok", to: "/su-invito" });
  });

  it("a temporary code sends to the forced change, after the acceptance", async () => {
    const db = fakeDb({
      memberships: [none, slot("B")],
      rpc: { accept_pending_invitation: { data: "ok", error: null } },
    });
    expect(await go(db, { r2y_must_change_code: true })).toEqual({
      status: "ok",
      to: "/altro/account?obbligatorio=1",
    });
    expect(db.calls[0]).toBe("accept_pending_invitation");
  });

  it("a failing sync_my_email does not stop the login", async () => {
    const db = fakeDb({
      memberships: [slot("B")],
      rpc: { sync_my_email: { data: null, error: { code: "42501", message: "forbidden" } } },
    });
    expect(await go(db)).toEqual({ status: "ok", to: "/" });
  });

  it("reports an outage instead of guessing a destination", async () => {
    const db = fakeDb({ memberships: [{ data: null, error: { status: 540, message: "" } }] });
    expect((await go(db)).status).toBe("error");
  });
});
