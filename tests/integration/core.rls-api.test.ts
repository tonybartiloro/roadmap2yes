import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  type TestPartnerB,
  type TestWedding,
} from "../support/supabase";

/** Through the real API (PostgREST + JWT): RLS, column grants and EXECUTE rules of the core DB. */

const RITES = ["civile", "religioso", "simbolico", "unknown"] as const;

describe("core DB through the API", () => {
  let w1: TestWedding;
  let w2: TestWedding;
  let b1: TestPartnerB;

  beforeAll(async () => {
    w1 = await createWedding("sposo");
    w2 = await createWedding("sposa");
    b1 = await addPartnerB(w1);
  });

  describe("anonymous visitor (publishable key, no session)", () => {
    it("reads nothing and cannot call any function", async () => {
      const anon = anonClient();
      for (const table of ["weddings", "wedding_partners", "memberships", "invitations", "account_events", "audit_log"] as const) {
        const { data, error } = await anon.from(table).select("*");
        expect(data ?? []).toHaveLength(0);
        expect(error?.code, table).toBe("42501");
      }
      expect((await anon.rpc("create_wedding")).error?.code).toBe("42501");
      expect((await anon.rpc("accept_pending_invitation")).error?.code).toBe("42501");
      expect((await anon.rpc("has_permission", { p_wedding_id: w1.weddingId, p_area: "wedding", p_action: "read" })).error?.code).toBe("42501");
      expect(
        (await anon.rpc("login_gate", { p_email_key: "\\x" + "01".repeat(32) })).error?.code,
      ).toBe("42501");
    });
  });

  describe("create_wedding", () => {
    it("is refused to a user without the founder claim (AC3)", async () => {
      const plain = await signInAs(await createUser());
      const { error } = await plain.rpc("create_wedding");
      expect(error?.code).toBe("42501");
      expect(error?.message).toBe("not_founder");
    });

    it("gives the founder one wedding, partner A labelled from r2y_role, and refuses a second", async () => {
      const { data: partners } = await w1.founderClient.from("wedding_partners").select("slot,label,email,user_id").eq("slot", "A");
      expect(partners).toEqual([
        { slot: "A", label: "sposo", email: w1.founder.email, user_id: w1.founder.id },
      ]);
      const second = await w1.founderClient.rpc("create_wedding");
      expect(second.error?.message).toBe("already_member");
    });

    it("is idempotent under a double click: one wedding, never two", async () => {
      const founder = await createUser({ founder: true, role: "sposa" });
      const client = await signInAs(founder);
      const results = await Promise.all([client.rpc("create_wedding"), client.rpc("create_wedding")]);
      expect(results.filter((r) => !r.error)).toHaveLength(1);
      expect(results.filter((r) => r.error)).toHaveLength(1);
      const { count } = await serviceClient().from("weddings").select("id", { count: "exact", head: true }).eq("created_by", founder.id);
      expect(count).toBe(1);
    });
  });

  describe("isolation between weddings (AC10)", () => {
    it("each side sees only its own rows", async () => {
      for (const [client, own, other] of [
        [w1.founderClient, w1.weddingId, w2.weddingId],
        [w2.founderClient, w2.weddingId, w1.weddingId],
      ] as const) {
        const weddings = await client.from("weddings").select("id");
        expect(weddings.data?.map((r) => r.id)).toEqual([own]);
        const memberships = await client.from("memberships").select("wedding_id");
        expect(new Set(memberships.data?.map((r) => r.wedding_id))).toEqual(new Set([own]));
        const audit = await client.from("audit_log").select("id").eq("wedding_id", other);
        expect(audit.data).toEqual([]);
      }
    });

    it("cannot write a foreign wedding: the row is simply not there", async () => {
      const result = await w1.founderClient.from("weddings").update({ rite: "civile" }).eq("id", w2.weddingId).select();
      expect(result.data).toEqual([]);
      const { data } = await serviceClient().from("weddings").select("rite").eq("id", w2.weddingId).single();
      expect(data?.rite).toBeNull();
    });

    it("cannot move a partner row into another wedding", async () => {
      const { error } = await w1.founderClient.from("wedding_partners").update({ wedding_id: w2.weddingId } as never).eq("slot", "A");
      expect(error?.code).toBe("42501");
    });

    it("cannot call invitation RPCs on a foreign invitation", async () => {
      const bee = await createUser();
      await w2.founderClient.rpc("upsert_partner_b", { p_email: bee.email });
      const created = await w2.founderClient.rpc("create_invitation", {
        p_email: bee.email,
        p_method: "email",
        p_token_hash: "\\x" + createHash("sha256").update(randomBytes(32)).digest("hex"),
      });
      expect(created.error).toBeNull();
      const id = (created.data as { id: string }).id;

      const revoke = await w1.founderClient.rpc("revoke_invitation", { p_invitation_id: id });
      expect(revoke.error?.code).toBe("42501");
      const rotate = await w1.founderClient.rpc("rotate_invitation", {
        p_invitation_id: id,
        p_token_hash: "\\x" + "ab".repeat(32),
      });
      expect(rotate.error?.code).toBe("42501");
    });
  });

  describe("direct writes follow the matrix 3.1", () => {
    it("accepts the business columns and bumps the version", async () => {
      const before = await w1.founderClient.from("weddings").select("version").single();
      const { error } = await w1.founderClient.from("weddings").update({ theme_id: "giardino", style_label: "romantico" }).eq("id", w1.weddingId);
      expect(error).toBeNull();
      const after = await w1.founderClient.from("weddings").select("version,updated_by").single();
      expect(after.data?.version).toBe((before.data?.version ?? 0) + 1);
      expect(after.data?.updated_by).toBe(w1.founder.id);
    });

    it.each(RITES)("accepts rite %s", async (rite) => {
      const { error } = await w1.founderClient.from("weddings").update({ rite }).eq("id", w1.weddingId);
      expect(error).toBeNull();
    });

    it("rejects an unknown rite", async () => {
      const { error } = await w1.founderClient.from("weddings").update({ rite: "barbecue" as never }).eq("id", w1.weddingId);
      expect(error?.code).toBe("23514");
    });

    it.each([
      ["weddings", { version: 99 }],
      ["weddings", { applied_reference_date: "2027-09-03" }],
      ["weddings", { onboarding_completed_at: new Date().toISOString() }],
      ["weddings", { manual_reference_option_id: "00000000-0000-4000-8000-000000000001" }],
      ["wedding_partners", { email: "someone.else@example.test" }],
      ["wedding_partners", { user_id: "00000000-0000-4000-8000-000000000001" }],
    ] as const)("refuses a direct update of %s %j", async (table, patch) => {
      const { error } =
        table === "weddings"
          ? await w1.founderClient.from("weddings").update(patch as never).eq("id", w1.weddingId)
          : await w1.founderClient.from("wedding_partners").update(patch as never).eq("slot", "A");
      expect(error?.code).toBe("42501");
    });

    it("refuses INSERT/DELETE on every core table and any write on memberships/account_events/state", async () => {
      const c = w1.founderClient;
      expect((await c.from("memberships").insert({ wedding_id: w1.weddingId, user_id: w1.founder.id, role: "partner", partner_slot: "B" })).error?.code).toBe("42501");
      expect((await c.from("weddings").insert({})).error?.code).toBe("42501");
      expect((await c.from("weddings").delete().eq("id", w1.weddingId)).error?.code).toBe("42501");
      expect((await c.from("wedding_partners").delete().eq("slot", "A")).error?.code).toBe("42501");
      expect((await c.from("memberships").update({ role: "family" } as never).eq("wedding_id", w1.weddingId)).error?.code).toBe("42501");
      expect((await c.from("account_events").insert({ wedding_id: w1.weddingId, kind: "code_changed", actor_id: w1.founder.id })).error?.code).toBe("42501");
      expect((await c.from("audit_log").delete().eq("wedding_id", w1.weddingId)).error?.code).toBe("42501");
      expect((await c.from("invitations").insert({ wedding_id: w1.weddingId, email: "x@example.test", method: "code" })).error?.code).toBe("42501");
    });
  });

  describe("secrets stay private", () => {
    it("`select *` on invitations is refused and token_hash is not selectable", async () => {
      const star = await w1.founderClient.from("invitations").select("*");
      expect(star.error?.code).toBe("42501");
      const hash = await w1.founderClient.from("invitations").select("token_hash");
      expect(hash.error?.code).toBe("42501");
      const ok = await w1.founderClient.from("invitations").select("id,email,method,accepted_at");
      expect(ok.error).toBeNull();
    });

    it("the private schema is not exposed", async () => {
      const client = w1.founderClient as unknown as { schema: (s: string) => { from: (t: string) => { select: () => Promise<{ error: { code?: string } | null }> } } };
      const { error } = await client.schema("private").from("login_attempts").select();
      expect(error?.code).toBe("PGRST106");
    });

    it("audit_log never carries token_hash", async () => {
      const { data } = await serviceClient().from("audit_log").select("old_data,new_data").eq("table_name", "invitations");
      expect(data?.length).toBeGreaterThan(0);
      for (const row of data ?? []) {
        expect(JSON.stringify(row)).not.toContain("token_hash");
      }
    });
  });

  describe("service-key-only functions", () => {
    it("are refused to authenticated users and allowed to the secret key", async () => {
      const key = "\\x" + createHash("sha256").update("fake.limiter@example.test").digest("hex");
      for (const call of [
        w1.founderClient.rpc("login_gate", { p_email_key: key }),
        w1.founderClient.rpc("login_record", { p_email_key: key, p_ip_key: key, p_success: true }),
        w1.founderClient.rpc("record_heartbeat", { p_source: "test" }),
        w1.founderClient.rpc("auth_user_id_by_email", { p_email: w1.founder.email }),
      ]) {
        expect((await call).error?.code).toBe("42501");
      }
      const service = serviceClient();
      expect((await service.rpc("login_gate", { p_email_key: key })).data).toEqual({ blocked: false, retry_after_seconds: 0 });
      expect((await service.rpc("auth_user_id_by_email", { p_email: w1.founder.email.toUpperCase() })).data).toBe(w1.founder.id);
      expect((await service.rpc("record_heartbeat", { p_source: "daily_job", p_details: { ok: true } })).error).toBeNull();
      expect((await w1.founderClient.rpc("last_heartbeat")).data).toEqual(expect.any(String));
    });
  });

  describe("partner B has the same permissions as A (AC6)", () => {
    it("is a partner with slot B, sees the shared wedding and edits it", async () => {
      const { data: memberships } = await b1.client.from("memberships").select("user_id,role,partner_slot").order("partner_slot");
      expect(memberships).toEqual([
        { user_id: w1.founder.id, role: "partner", partner_slot: "A" },
        { user_id: b1.user.id, role: "partner", partner_slot: "B" },
      ]);
      const { error } = await b1.client.from("weddings").update({ region: "Toscana" }).eq("id", w1.weddingId);
      expect(error).toBeNull();
      const seen = await w1.founderClient.from("weddings").select("region").single();
      expect(seen.data?.region).toBe("Toscana");
    });

    it("a third account cannot take a slot", async () => {
      const third = await signInAs(await createUser());
      expect((await third.rpc("accept_pending_invitation")).data).toBe("not_found");
    });

    it("a partner never sees account events of another wedding, and sees the other partner's", async () => {
      const own = await w1.founderClient.rpc("authorize_account_op", { p_op: "change_own_code" });
      expect(own.error).toBeNull();
      const { data } = await b1.client.from("account_events").select("kind,actor_id");
      expect(data).toContainEqual({ kind: "code_changed", actor_id: w1.founder.id });
      const foreign = await w2.founderClient.from("account_events").select("actor_id").eq("actor_id", w1.founder.id);
      expect(foreign.data).toEqual([]);
    });

    it("per-user state: first visit has no previous_seen_at, welcome is dismissible", async () => {
      const first = await b1.client.rpc("record_seen");
      expect((first.data as { previous_seen_at: string | null }).previous_seen_at).toBeNull();
      const second = await b1.client.rpc("record_seen");
      expect((second.data as { previous_seen_at: string | null }).previous_seen_at).not.toBeNull();
      expect(((await b1.client.rpc("dismiss_welcome")).data as { welcome_dismissed_at: string | null }).welcome_dismissed_at).not.toBeNull();
      expect((await b1.client.rpc("record_export")).error).toBeNull();
      const { data } = await b1.client.from("user_wedding_state").select("user_id");
      expect(data).toEqual([{ user_id: b1.user.id }]);
    });
  });
});
