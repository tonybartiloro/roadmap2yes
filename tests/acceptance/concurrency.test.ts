import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { versionedUpdate } from "@/lib/supabase/versioned-update";
import {
  addPartnerB,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  uniqueEmail,
} from "../support/supabase";

/**
 * QA T17a: concurrency through PostgREST (real parallel HTTP calls, real transactions).
 * AC6 (accept race), AC3 (create_wedding once), AC40 (version conflict). The invariants are checked
 * in the database with the secret key, not only from the callers' answers: no 5xx, no deadlock
 * (40P01), no serialization failure leaking out, never a second membership.
 */

const hex = (bytes: Buffer) => `\\x${bytes.toString("hex")}`;
const tokenHash = () => hex(createHash("sha256").update(randomBytes(32)).digest());
type Answer = { error: { code?: string; message: string } | null; status: number; data?: unknown };
const notServerError = (answers: Answer[], label: string) => {
  for (const a of answers) {
    expect(a.status, `${label}: HTTP ${a.status} ${a.error?.message ?? ""}`).toBeLessThan(500);
    expect(a.error?.code, label).not.toBe("40P01");
    expect(a.error?.code, label).not.toBe("40001");
  }
};

describe("versionedUpdate: parallel writers on the same version (AC40)", () => {
  it("weddings: of N parallel updates from two partners exactly one wins; the rest get author + time", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const version = (
      (await w.founderClient.from("weddings").select("version").single()).data as {
        version: number;
      }
    ).version;

    const writers = Array.from({ length: 10 }, (_, i) => ({
      client: i % 2 === 0 ? w.founderClient : b.client,
      label: `style-${i}`,
    }));
    const results = await Promise.all(
      writers.map((x) =>
        versionedUpdate(x.client, "weddings", w.weddingId, version, { style_label: x.label }),
      ),
    );

    const winners = results.map((r, i) => ({ r, i })).filter(({ r }) => !r.conflict);
    expect(winners).toHaveLength(1);
    const winner = winners[0]!;
    const winnerLabel = writers[winner.i]!.label;
    const winnerId = winner.i % 2 === 0 ? w.founder.id : b.user.id;
    for (const { r } of results.filter((x) => x.conflict).map((r) => ({ r }))) {
      if (!r.conflict) continue;
      expect(r.changedBy).toBe(winnerId);
      expect(r.changedAt).toEqual(expect.any(String));
      expect(r.current?.style_label).toBe(winnerLabel);
      expect(r.current?.version).toBe(version + 1);
    }
    const { data } = await serviceClient()
      .from("weddings")
      .select("style_label,version,updated_by")
      .eq("id", w.weddingId)
      .single();
    expect(data).toEqual({ style_label: winnerLabel, version: version + 1, updated_by: winnerId });
  });

  it("tasks: the same stampede on a task row; 'save anyway' (retry with the current version) then succeeds exactly once", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const inserted = await w.founderClient
      .from("tasks")
      .insert({ wedding_id: w.weddingId, title: "Prenotare la sala" })
      .select("id,version")
      .single();
    expect(inserted.error).toBeNull();
    const { id, version } = inserted.data as { id: string; version: number };

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        versionedUpdate(i % 2 ? b.client : w.founderClient, "tasks", id, version, {
          title: `Titolo ${i}`,
        }),
      ),
    );
    expect(results.filter((r) => !r.conflict)).toHaveLength(1);
    expect(results.filter((r) => r.conflict)).toHaveLength(7);

    // everybody who lost retries with the CURRENT version at the same time: again exactly one wins
    const current = (
      (await serviceClient().from("tasks").select("version").eq("id", id).single()).data as {
        version: number;
      }
    ).version;
    expect(current).toBe(version + 1);
    const retry = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        versionedUpdate(i % 2 ? b.client : w.founderClient, "tasks", id, current, {
          notes: `Nota ${i}`,
        }),
      ),
    );
    expect(retry.filter((r) => !r.conflict)).toHaveLength(1);
    const final = await serviceClient().from("tasks").select("version").eq("id", id).single();
    expect((final.data as { version: number }).version).toBe(current + 1);
  });

  it("a parallel update by an outsider never wins and never sees the row (not a conflict with data)", async () => {
    const w = await createWedding();
    const other = await createWedding();
    const version = (
      (await w.founderClient.from("weddings").select("version").single()).data as {
        version: number;
      }
    ).version;
    const [mine, theirs] = await Promise.all([
      versionedUpdate(w.founderClient, "weddings", w.weddingId, version, { style_label: "mio" }),
      versionedUpdate(other.founderClient, "weddings", w.weddingId, version, {
        style_label: "intruso",
      }),
    ]);
    expect(mine.conflict).toBe(false);
    expect(theirs).toEqual({ conflict: true, current: null, changedBy: null, changedAt: null });
    const { data } = await serviceClient()
      .from("weddings")
      .select("style_label")
      .eq("id", w.weddingId)
      .single();
    expect(data?.style_label).toBe("mio");
  });
});

describe("create_wedding under parallel calls (AC3)", () => {
  it("8 parallel calls over two sessions of the same founder create exactly one wedding", async () => {
    const founder = await createUser({ founder: true, role: "sposa" });
    const sessions = [await signInAs(founder), await signInAs(founder)];
    const answers = await Promise.all(
      Array.from({ length: 8 }, (_, i) => sessions[i % 2]!.rpc("create_wedding")),
    );
    notServerError(answers, "create_wedding");

    const ok = answers.filter((a) => !a.error);
    expect(ok).toHaveLength(1);
    expect(
      answers
        .filter((a) => a.error)
        .every((a) => ["already_member", "already_created"].includes(a.error!.message)),
    ).toBe(true);
    const service = serviceClient();
    const weddings = await service.from("weddings").select("id").eq("created_by", founder.id);
    expect(weddings.data).toEqual([{ id: ok[0]!.data }]);
    const memberships = await service
      .from("memberships")
      .select("wedding_id,role,partner_slot")
      .eq("user_id", founder.id);
    expect(memberships.data).toEqual([
      { wedding_id: ok[0]!.data, role: "partner", partner_slot: "A" },
    ]);
    const partners = await service
      .from("wedding_partners")
      .select("slot,user_id")
      .eq("wedding_id", ok[0]!.data as string);
    expect(partners.data).toEqual([{ slot: "A", user_id: founder.id }]);
  });

  it("several founders creating at the same time each get their own isolated wedding", async () => {
    const founders = await Promise.all(
      [1, 2, 3, 4].map(() => createUser({ founder: true, role: "sposo" })),
    );
    const clients = await Promise.all(founders.map((f) => signInAs(f)));
    const answers = await Promise.all(clients.map((c) => c.rpc("create_wedding")));
    notServerError(answers, "parallel founders");
    const ids = answers.map((a) => a.data as string);
    expect(answers.every((a) => !a.error)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    for (const [i, client] of clients.entries()) {
      const { data } = await client.from("weddings").select("id");
      expect(data).toEqual([{ id: ids[i] }]);
    }
  });

  it("a non-founder in the same burst is refused and creates nothing", async () => {
    const founder = await createUser({ founder: true, role: "sposo" });
    const plain = await createUser();
    const [a, b] = await Promise.all([
      (await signInAs(founder)).rpc("create_wedding"),
      (await signInAs(plain)).rpc("create_wedding"),
    ]);
    expect(a.error).toBeNull();
    expect(b.error?.message).toBe("not_founder");
    const { count } = await serviceClient()
      .from("weddings")
      .select("id", { count: "exact", head: true })
      .eq("created_by", plain.id);
    expect(count).toBe(0);
  });
});

describe("accept races (AC6)", () => {
  async function pendingCodeInvitation() {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    const created = await w.founderClient.rpc("create_invitation", {
      p_email: b.email,
      p_method: "code",
    });
    expect(created.error).toBeNull();
    return { w, b, invitationId: (created.data as { id: string }).id };
  }
  const bMemberships = async (weddingId: string) =>
    (
      await serviceClient()
        .from("memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("wedding_id", weddingId)
        .eq("partner_slot", "B")
    ).count;

  it("6 parallel accepts from two sessions of the same invitee: one `ok`, the rest `already_member`, one membership", async () => {
    const { w, b } = await pendingCodeInvitation();
    const sessions = [await signInAs(b), await signInAs(b)];
    const answers = await Promise.all(
      Array.from({ length: 6 }, (_, i) => sessions[i % 2]!.rpc("accept_pending_invitation")),
    );
    notServerError(answers, "accept");
    expect(answers.every((a) => !a.error)).toBe(true);
    expect(answers.map((a) => a.data).sort()).toEqual([
      "already_member",
      "already_member",
      "already_member",
      "already_member",
      "already_member",
      "ok",
    ]);
    expect(await bMemberships(w.weddingId)).toBe(1);
    const partner = await serviceClient()
      .from("wedding_partners")
      .select("user_id")
      .eq("wedding_id", w.weddingId)
      .eq("slot", "B")
      .single();
    expect(partner.data?.user_id).toBe(b.id);
  });

  it("the invitee and a stranger accepting at the same time: only the invitee gets in", async () => {
    const { w, b } = await pendingCodeInvitation();
    const intruder = await createUser();
    const [mine, theirs] = await Promise.all([
      (await signInAs(b)).rpc("accept_pending_invitation"),
      (await signInAs(intruder)).rpc("accept_pending_invitation"),
    ]);
    expect(mine.data).toBe("ok");
    expect(theirs.data).toBe("not_found");
    expect(await bMemberships(w.weddingId)).toBe(1);
    const { count } = await serviceClient()
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", intruder.id);
    expect(count).toBe(0);
  });

  it.each(["revoke", "rotate", "email_change", "redeliver", "revoke_twice"] as const)(
    "accept racing %s: deterministic outcome, state consistent with the answers, never a 5xx or a deadlock",
    async (kind) => {
      for (let round = 0; round < 3; round++) {
        const w = await createWedding();
        const b = await createUser();
        await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
        const created = await w.founderClient.rpc("create_invitation", {
          p_email: b.email,
          p_method: "email",
          p_token_hash: tokenHash(),
        });
        const id = (created.data as { id: string }).id;
        const bClient = await signInAs(b);

        const operation = () =>
          kind === "revoke" || kind === "revoke_twice"
            ? w.founderClient.rpc("revoke_invitation", { p_invitation_id: id })
            : kind === "rotate"
              ? w.founderClient.rpc("rotate_invitation", {
                  p_invitation_id: id,
                  p_token_hash: tokenHash(),
                })
              : kind === "email_change"
                ? w.founderClient.rpc("update_partner_email", {
                    p_slot: "B",
                    p_email: uniqueEmail("moved"),
                  })
                : w.founderClient.rpc("create_invitation", {
                    p_email: b.email,
                    p_method: "email",
                    p_token_hash: tokenHash(),
                  });
        const calls = [
          bClient.rpc("accept_pending_invitation"),
          operation(),
          ...(kind === "revoke_twice" ? [operation()] : []),
        ];
        const [accept, ...others] = await Promise.all(calls);

        notServerError([accept!, ...others] as Answer[], `${kind} round ${round}`);
        expect(
          ["ok", "revoked", "not_found", "expired"],
          `${kind} round ${round}: accept=${String(accept!.data)}`,
        ).toContain(accept!.data);
        const members = await bMemberships(w.weddingId);
        expect(members, `${kind}: membership iff accept said ok`).toBe(
          accept!.data === "ok" ? 1 : 0,
        );
        // an invitation is never accepted AND revoked
        const inv = await serviceClient()
          .from("invitations")
          .select("accepted_at,revoked_at")
          .eq("wedding_id", w.weddingId);
        for (const row of inv.data ?? [])
          expect(
            row.accepted_at !== null && row.revoked_at !== null,
            `${kind}: accepted and revoked`,
          ).toBe(false);
        if (accept!.data === "ok") {
          // when B got in, the operation on the invitation must have been refused for an accepted one
          // (`email_in_use`: B has signed in, so the account is no longer reusable, §4.8)
          for (const other of others) {
            if (other.error)
              expect(other.error.message, kind).toMatch(
                /already_accepted|partner_already_joined|not_pending|already_member|email_in_use/,
              );
          }
        }
      }
    },
    60_000,
  );

  it("direct INSERT into memberships stays denied under a burst (founder, partner and stranger)", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const stranger = await createUser();
    const attempts = [w.founderClient, b.client, await signInAs(stranger)].flatMap((c, i) =>
      Array.from({ length: 3 }, () =>
        c
          .from("memberships")
          .insert({
            wedding_id: w.weddingId,
            user_id: stranger.id,
            role: "partner",
            partner_slot: i === 0 ? "B" : "A",
          }),
      ),
    );
    const answers = await Promise.all(attempts);
    expect(answers.every((a) => a.error?.code === "42501")).toBe(true);
    const { count } = await serviceClient()
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("wedding_id", w.weddingId);
    expect(count).toBe(2);
  });

  it("two partners racing the limit: a third account can never take a slot", async () => {
    const w = await createWedding();
    await addPartnerB(w);
    const thirds = await Promise.all([1, 2, 3].map(() => createUser()));
    for (const t of thirds)
      await serviceClient()
        .from("invitations")
        .insert({ wedding_id: w.weddingId, email: t.email, method: "code" });
    const answers = await Promise.all(
      (await Promise.all(thirds.map((t) => signInAs(t)))).map((c) =>
        c.rpc("accept_pending_invitation"),
      ),
    );
    notServerError(answers, "third accounts");
    expect(answers.every((a) => a.data === "full" || a.data === "not_found")).toBe(true);
    const { count } = await serviceClient()
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("wedding_id", w.weddingId);
    expect(count).toBe(2);
  });
});
