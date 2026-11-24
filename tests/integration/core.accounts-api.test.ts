import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  uniqueEmail,
} from "../support/supabase";

/**
 * Account contract (plan §4.8) and the negative paths the security review asked for:
 * founder claim source, accept races, reusable accounts, events that cannot be forged,
 * login limiter under concurrency.
 */

const hex = (bytes: Buffer) => "\\x" + bytes.toString("hex");
const tokenHash = () => hex(createHash("sha256").update(randomBytes(32)).digest());
const rpcErrors = (results: { error: { code?: string; message: string } | null }[]) =>
  results.map((r) => r.error?.code ?? "ok");

describe("founder claim", () => {
  it("only counts in app_metadata: a user who writes user_metadata.r2y_founder is refused", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    const { error: updateError } = await client.auth.updateUser({ data: { r2y_founder: true } });
    expect(updateError).toBeNull();
    const again = await signInAs(user); // fresh JWT carrying the new user_metadata
    const { data } = await again.auth.getUser();
    expect(data.user?.user_metadata["r2y_founder"]).toBe(true);
    expect(data.user?.app_metadata["r2y_founder"]).toBeUndefined();
    const { error } = await again.rpc("create_wedding");
    expect(error?.code).toBe("42501");
    expect(error?.message).toBe("not_founder");
  });
});

describe("partner B: reusable accounts and the DB -> admin contract", () => {
  it("create_invitation returns the reusable account, refuses it once it has signed in", async () => {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    const created = await w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "code" });
    expect(created.error).toBeNull();
    expect((created.data as { invitee_user_id: string }).invitee_user_id).toBe(b.id);

    await signInAs(b); // first sign-in: the account is no longer reusable
    const again = await w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "code" });
    expect(again.error?.message).toBe("email_in_use");
    const revoked = await w.founderClient.rpc("revoke_invitation", {
      p_invitation_id: (created.data as { id: string }).id,
    });
    expect(revoked.data).toEqual({ delete_user_id: null });
  });

  it("a partner cannot attach a founder or foreign member account through a direct call", async () => {
    const w = await createWedding();
    const other = await createWedding();
    for (const email of [other.founder.email]) {
      const r = await w.founderClient.rpc("create_invitation", {
        p_email: email,
        p_method: "email",
        p_token_hash: tokenHash(),
      });
      expect(r.error?.message).toBe("email_in_use");
    }
  });

  it("revoke returns the account to delete only while it is reusable, and writes one event", async () => {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    const inv = await w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "code" });
    const id = (inv.data as { id: string }).id;
    const first = await w.founderClient.rpc("revoke_invitation", { p_invitation_id: id });
    expect(first.data).toEqual({ delete_user_id: b.id });
    const second = await w.founderClient.rpc("revoke_invitation", { p_invitation_id: id });
    expect(second.data).toEqual({ delete_user_id: b.id });
    const { data: events } = await w.founderClient.from("account_events").select("kind,actor_id,target_user_id").eq("kind", "invite_revoked");
    expect(events).toEqual([{ kind: "invite_revoked", actor_id: w.founder.id, target_user_id: b.id }]);
  });

  it("invitation_by_token is secret-key only and answers neutrally", async () => {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    const hash = tokenHash();
    await w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "email", p_token_hash: hash });

    expect((await w.founderClient.rpc("invitation_by_token", { p_token_hash: hash })).error?.code).toBe("42501");
    expect((await anonClient().rpc("invitation_by_token", { p_token_hash: hash })).error?.code).toBe("42501");
    const service = serviceClient();
    const ok = await service.rpc("invitation_by_token", { p_token_hash: hash });
    expect(ok.data).toMatchObject({ ok: true, user_id: b.id });
    expect((await service.rpc("invitation_by_token", { p_token_hash: tokenHash() })).data).toEqual({ ok: false });
  });

  it("account events cannot be forged: no record_account_event, no direct insert, kind/target derived", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const forged = await w.founderClient.rpc("record_account_event" as never, { p_kind: "temp_code_set" } as never);
    expect(forged.error).not.toBeNull();
    const insert = await w.founderClient.from("account_events").insert({ wedding_id: w.weddingId, kind: "temp_code_set", actor_id: w.founder.id, target_user_id: b.user.id });
    expect(insert.error?.code).toBe("42501");

    const op = await w.founderClient.rpc("authorize_account_op", { p_op: "set_temp_code", p_target_slot: "B" });
    expect(op.data).toMatchObject({ allowed: true, target_user_id: b.user.id });
    const { data } = await b.client.from("account_events").select("kind,actor_id,target_user_id").eq("kind", "temp_code_set");
    expect(data).toEqual([{ kind: "temp_code_set", actor_id: w.founder.id, target_user_id: b.user.id }]);
  });

  it("set_temp_code never reaches a user of another wedding", async () => {
    const w1 = await createWedding();
    const w2 = await createWedding();
    const b1 = await addPartnerB(w1);
    const result = await w2.founderClient.rpc("authorize_account_op", { p_op: "set_temp_code", p_target_slot: "B" });
    expect(result.data).toEqual({ allowed: false, error: "no_account" });
    expect(JSON.stringify(result.data)).not.toContain(b1.user.id);
  });
});

describe("acceptance races (AC6)", () => {
  it("two parallel accepts of the same user create exactly one membership", async () => {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    await w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "code" });
    const client = await signInAs(b);
    const results = await Promise.all([client.rpc("accept_pending_invitation"), client.rpc("accept_pending_invitation")]);
    expect(results.every((r) => !r.error)).toBe(true);
    expect(results.map((r) => r.data).sort()).toEqual(["already_member", "ok"]);
    const { count } = await serviceClient().from("memberships").select("user_id", { count: "exact", head: true }).eq("user_id", b.id);
    expect(count).toBe(1);
  });

  it("a third account gets `full` when both partner slots are taken", async () => {
    const w = await createWedding();
    await addPartnerB(w);
    const third = await createUser();
    const { error } = await serviceClient().from("invitations").insert({ wedding_id: w.weddingId, email: third.email, method: "code" });
    expect(error).toBeNull();
    const client = await signInAs(third);
    expect((await client.rpc("accept_pending_invitation")).data).toBe("full");
    const { count } = await serviceClient().from("memberships").select("user_id", { count: "exact", head: true }).eq("wedding_id", w.weddingId);
    expect(count).toBe(2);
  });

  it("accept racing revoke / rotate / email change / re-delivery: deterministic, never a deadlock", async () => {
    for (let round = 0; round < 3; round++) {
      for (const kind of ["revoke", "rotate", "email_change", "redeliver"] as const) {
        const w = await createWedding();
        const b = await createUser();
        await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
        const hash = tokenHash();
        const inv = await w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "email", p_token_hash: hash });
        const id = (inv.data as { id: string }).id;
        const bClient = await signInAs(b);

        const other =
          kind === "revoke"
            ? w.founderClient.rpc("revoke_invitation", { p_invitation_id: id })
            : kind === "rotate"
              ? w.founderClient.rpc("rotate_invitation", { p_invitation_id: id, p_token_hash: tokenHash() })
              : kind === "email_change"
                ? w.founderClient.rpc("update_partner_email", { p_slot: "B", p_email: uniqueEmail("moved") })
                : w.founderClient.rpc("create_invitation", { p_email: b.email, p_method: "email", p_token_hash: tokenHash() });
        const [accept, op] = await Promise.all([bClient.rpc("accept_pending_invitation"), other]);

        const codes = rpcErrors([accept, op]);
        expect(codes, `${kind} round ${round}`).not.toContain("40P01");
        expect(codes.every((c) => c === "ok" || c === "P0001"), `${kind}: ${codes.join(",")}`).toBe(true);
        expect(["ok", "revoked", "not_found", "expired"]).toContain(accept.data);
        // never more than one B membership
        const { count } = await serviceClient().from("memberships").select("user_id", { count: "exact", head: true }).eq("wedding_id", w.weddingId).eq("partner_slot", "B");
        expect(count).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("login limiter (service key)", () => {
  const key = () => hex(randomBytes(32));

  it("concurrent failures on the same key keep the count exact", async () => {
    const service = serviceClient();
    const email = key();
    const ip = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.rpc("login_record", { p_email_key: email, p_ip_key: ip, p_success: false })),
    );
    expect(results.every((r) => !r.error)).toBe(true);
    expect((await service.rpc("login_gate", { p_email_key: email })).data).toMatchObject({ blocked: true });
    // the IP key counted 5 failures but is not blocked (limit 20)
    expect((await service.rpc("login_gate", { p_email_key: key(), p_ip_key: ip })).data).toMatchObject({ blocked: false });
  });

  it("a success does not erase an active lock", async () => {
    const service = serviceClient();
    const email = key();
    for (let i = 0; i < 5; i++) await service.rpc("login_record", { p_email_key: email, p_ip_key: null as never, p_success: false });
    await service.rpc("login_record", { p_email_key: email, p_ip_key: null as never, p_success: true });
    expect((await service.rpc("login_gate", { p_email_key: email })).data).toMatchObject({ blocked: true });
  });
});
