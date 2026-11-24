import { beforeAll, describe, expect, it } from "vitest";
import {
  createPartnerForEmailInvite,
  createPartnerWithCode,
  revokePartnerInvitation,
  setTemporaryCode,
  updatePendingPartnerEmail,
  type UserRpc,
} from "@/features/accounts/admin-ops";
import { hashInviteToken } from "@/features/invitations/token";
import {
  addPartnerB,
  anonClient,
  createUser,
  createWedding,
  randomCode,
  serviceClient,
  signInAs,
  stackEnv,
  uniqueEmail,
} from "../support/supabase";

/**
 * Partner operations (plan §4.5, §4.6, §4.8) against the real stack: the DB step with the user's
 * JWT, then the admin step on the id the DB returned. Admin failures are in
 * `accounts.admin-failure.test.ts`; the email invite flow in `accounts.invite-flow.test.ts`.
 */

beforeAll(() => {
  const env = stackEnv();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = env.url;
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = env.publishableKey;
  process.env["SUPABASE_SECRET_KEY"] = env.secretKey;
});

const asRpc = (client: unknown) => client as UserRpc;
const canSignIn = async (email: string, code: string) =>
  (await anonClient().auth.signInWithPassword({ email, password: code })).error === null;
const authUserByEmail = async (email: string) => {
  const { data } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
  return data.users.filter((user) => user.email === email);
};
const pendingInvitations = async (weddingId: string) => {
  const { data } = await serviceClient()
    .from("invitations")
    .select("id, email, method, invitee_user_id, send_count, revoked_at, accepted_at")
    .eq("wedding_id", weddingId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  return data ?? [];
};
const eventsOf = async (weddingId: string) => {
  const { data } = await serviceClient()
    .from("account_events")
    .select("kind, actor_id, target_user_id")
    .eq("wedding_id", weddingId)
    .order("at");
  return data ?? [];
};

describe("createPartnerWithCode (AC5)", () => {
  it("creates the account with the initial code; B enters and the membership is made by the DB (AC4, AC6)", async () => {
    const w = await createWedding();
    const email = uniqueEmail("jessica");
    const code = randomCode();

    const result = await createPartnerWithCode(asRpc(w.founderClient), { email, code });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain(code); // the code is never returned

    const [created] = await authUserByEmail(email);
    expect(created?.last_sign_in_at).toBeFalsy(); // never entered yet
    const invitations = await pendingInvitations(w.weddingId);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      email,
      method: "code",
      invitee_user_id: created?.id,
    });
    // Written BEFORE the account exists (step 1), so for a new address the target is still null.
    expect(await eventsOf(w.weddingId)).toEqual([
      { kind: "partner_account_created", actor_id: w.founder.id, target_user_id: null },
    ]);

    const b = await signInAs({ email, code });
    expect((await b.rpc("accept_pending_invitation")).data).toBe("ok"); // enters A's space
    const membership = await b
      .from("memberships")
      .select("wedding_id, partner_slot")
      .eq("user_id", created?.id ?? "");
    expect(membership.data).toEqual([{ wedding_id: w.weddingId, partner_slot: "B" }]);
  });

  it("a reusable account (never entered) gets a new code: delivering again replaces it", async () => {
    const w = await createWedding();
    const b = await createUser();
    const code = randomCode();

    const result = await createPartnerWithCode(asRpc(w.founderClient), { email: b.email, code });
    expect(result).toMatchObject({ ok: true, userId: b.id });
    expect(await canSignIn(b.email, b.code)).toBe(false);
    expect(await canSignIn(b.email, code)).toBe(true);
  });

  it("delivering again to a pending B changes the code and keeps one invitation", async () => {
    const w = await createWedding();
    const email = uniqueEmail("again");
    const first = randomCode();
    const second = randomCode();
    await createPartnerWithCode(asRpc(w.founderClient), { email, code: first });
    await createPartnerWithCode(asRpc(w.founderClient), { email, code: second });
    expect(await canSignIn(email, first)).toBe(false);
    expect(await canSignIn(email, second)).toBe(true);
    const invitations = await pendingInvitations(w.weddingId);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.send_count).toBe(2);
  });

  it("refuses accounts that are not reusable and leaves their code untouched (BR20)", async () => {
    const w = await createWedding();
    const other = await createWedding(); // a founder with a space
    const entered = await createUser();
    await signInAs(entered); // first sign-in: no longer reusable
    const member = await addPartnerB(other);

    for (const victim of [other.founder, entered, member.user]) {
      const result = await createPartnerWithCode(asRpc(w.founderClient), {
        email: victim.email,
        code: randomCode(),
      });
      expect(result).toEqual({ ok: false, error: "email_in_use" });
      expect(await canSignIn(victim.email, victim.code)).toBe(true);
    }
  });

  it("the partner's own email is refused, and so is a caller who is not a partner", async () => {
    const w = await createWedding();
    expect(
      await createPartnerWithCode(asRpc(w.founderClient), {
        email: w.founder.email,
        code: randomCode(),
      }),
    ).toEqual({ ok: false, error: "same_email" });

    const stranger = await createUser();
    const strangerClient = await signInAs(stranger);
    const email = uniqueEmail("nobody");
    expect(
      await createPartnerWithCode(asRpc(strangerClient), { email, code: randomCode() }),
    ).toEqual({ ok: false, error: "not_partner" });
    expect(await authUserByEmail(email)).toHaveLength(0); // the DB said no BEFORE any account existed
    expect(
      await createPartnerWithCode(asRpc(anonClient()), { email, code: randomCode() }),
    ).toMatchObject({ ok: false });
    expect(await authUserByEmail(email)).toHaveLength(0);
  });

  it("two simultaneous creations for the same email converge: one account, one invitation", async () => {
    const w = await createWedding();
    const email = uniqueEmail("race");
    const codes = [randomCode(), randomCode()] as const;
    const results = await Promise.all(
      codes.map((code) => createPartnerWithCode(asRpc(w.founderClient), { email, code })),
    );
    expect(results).toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
    expect(await authUserByEmail(email)).toHaveLength(1);
    const invitations = await pendingInvitations(w.weddingId);
    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.invitee_user_id).toBe((await authUserByEmail(email))[0]?.id);
    const works = await Promise.all(codes.map((code) => canSignIn(email, code)));
    expect(works.filter(Boolean)).toHaveLength(1); // exactly the last delivered code
  });
});

describe("revokePartnerInvitation", () => {
  it("revokes, deletes the never-used account and nothing else; repeating is harmless", async () => {
    const w = await createWedding();
    const bystander = await createUser();
    const email = uniqueEmail("revoked");
    const code = randomCode();
    const created = await createPartnerWithCode(asRpc(w.founderClient), { email, code });
    if (!created.ok) throw new Error("setup");

    const revoked = await revokePartnerInvitation(asRpc(w.founderClient), created.invitationId);
    expect(revoked).toEqual({ ok: true, deletedUserId: created.userId });
    expect(await authUserByEmail(email)).toHaveLength(0);
    expect(await canSignIn(email, code)).toBe(false);
    expect(await canSignIn(bystander.email, bystander.code)).toBe(true);

    const again = await revokePartnerInvitation(asRpc(w.founderClient), created.invitationId);
    expect(again).toEqual({ ok: true, deletedUserId: null });
    const kinds = (await eventsOf(w.weddingId)).map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "invite_revoked")).toHaveLength(1);
  });

  it("after B has entered the DB refuses: already_accepted, and the account is not touched", async () => {
    const w = await createWedding();
    const b = await createUser();
    const created = await createPartnerWithCode(asRpc(w.founderClient), {
      email: b.email,
      code: b.code,
    });
    if (!created.ok) throw new Error("setup");
    const client = await signInAs(b);
    expect((await client.rpc("accept_pending_invitation")).data).toBe("ok");

    expect(await revokePartnerInvitation(asRpc(w.founderClient), created.invitationId)).toEqual({
      ok: false,
      error: "already_accepted",
    });
    expect(await canSignIn(b.email, b.code)).toBe(true);
  });

  it("accept racing revoke: deterministic outcome and the account is never deleted (REV-2)", async () => {
    for (let round = 0; round < 4; round += 1) {
      const w = await createWedding();
      const b = await createUser();
      const created = await createPartnerWithCode(asRpc(w.founderClient), {
        email: b.email,
        code: b.code,
      });
      if (!created.ok) throw new Error("setup");
      const client = await signInAs(b); // B has entered: the account is no longer reusable

      const [accepted, revoked] = await Promise.all([
        client.rpc("accept_pending_invitation"),
        revokePartnerInvitation(asRpc(w.founderClient), created.invitationId),
      ]);
      expect(accepted.error).toBeNull();
      if (revoked.ok) {
        expect(accepted.data).toBe("revoked");
        expect(revoked.deletedUserId).toBeNull(); // not reusable any more: never returned
      } else {
        expect(revoked.error).toBe("already_accepted");
        expect(accepted.data).toBe("ok");
      }
      expect(await canSignIn(b.email, b.code)).toBe(true);
    }
  });
});

describe("updatePendingPartnerEmail (AC58)", () => {
  it("moves the pending account to the new email: same code, partner row and invitation aligned", async () => {
    const w = await createWedding();
    const oldEmail = uniqueEmail("typo");
    const newEmail = uniqueEmail("fixed");
    const code = randomCode();
    await w.founderClient.rpc("upsert_partner_b", { p_email: oldEmail });
    await createPartnerWithCode(asRpc(w.founderClient), { email: oldEmail, code });

    const result = await updatePendingPartnerEmail(asRpc(w.founderClient), newEmail);
    expect(result).toMatchObject({ ok: true, oldEmail });
    expect(await canSignIn(oldEmail, code)).toBe(false);
    expect(await canSignIn(newEmail, code)).toBe(true);

    const partner = await w.founderClient.from("wedding_partners").select("email").eq("slot", "B");
    expect(partner.data).toEqual([{ email: newEmail }]);
    const invitations = await pendingInvitations(w.weddingId);
    expect(invitations.map((invitation) => invitation.email)).toEqual([newEmail]);
  });

  it("refuses once B has entered: partner_already_joined, the account email is untouched", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    expect(await updatePendingPartnerEmail(asRpc(w.founderClient), uniqueEmail("late"))).toEqual({
      ok: false,
      error: "partner_already_joined",
    });
    expect(await canSignIn(b.user.email, b.user.code)).toBe(true);
  });

  it("refuses an address that already has an account, and the caller's own", async () => {
    const w = await createWedding();
    const email = uniqueEmail("pending");
    const code = randomCode();
    const taken = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: email });
    await createPartnerWithCode(asRpc(w.founderClient), { email, code });

    expect(await updatePendingPartnerEmail(asRpc(w.founderClient), taken.email)).toEqual({
      ok: false,
      error: "email_in_use",
    });
    expect(await updatePendingPartnerEmail(asRpc(w.founderClient), w.founder.email)).toEqual({
      ok: false,
      error: "same_email",
    });
    expect(await canSignIn(email, code)).toBe(true);
    expect(await canSignIn(taken.email, taken.code)).toBe(true);
  });

  it("accept racing an email change: either B is in (and the change is refused) or the change wins", async () => {
    for (let round = 0; round < 4; round += 1) {
      const w = await createWedding();
      const b = await createUser();
      await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
      await createPartnerWithCode(asRpc(w.founderClient), { email: b.email, code: b.code });
      const client = await signInAs(b);

      const [accepted, changed] = await Promise.all([
        client.rpc("accept_pending_invitation"),
        updatePendingPartnerEmail(asRpc(w.founderClient), uniqueEmail("race")),
      ]);
      expect(accepted.error).toBeNull();
      if (changed.ok) {
        // The change got the lock first: the invitation now belongs to another address.
        expect(accepted.data).toBe("not_found");
      } else {
        expect(changed.error).toBe("partner_already_joined");
        expect(accepted.data).toBe("ok");
      }
      // Either way B's own account email did not move under them after joining.
      if (!changed.ok) expect(await canSignIn(b.email, b.code)).toBe(true);
    }
  });
});

describe("setTemporaryCode (AC57)", () => {
  it("sets the code and the forced-change flag on the OTHER partner, keeping their app_metadata", async () => {
    const w = await createWedding("sposa");
    const b = await addPartnerB(w);
    const temp = randomCode();

    // B forgot: A sets it. And the other way round: B can do the same for A (a founder).
    const forB = await setTemporaryCode(asRpc(w.founderClient), temp);
    expect(forB).toEqual({ ok: true, targetUserId: b.user.id, targetEmail: b.user.email });
    expect(await canSignIn(b.user.email, b.user.code)).toBe(false);
    const entered = await anonClient().auth.signInWithPassword({
      email: b.user.email,
      password: temp,
    });
    expect(entered.data.user?.app_metadata).toMatchObject({ r2y_must_change_code: true });

    const freshB = await signInAs({ email: b.user.email, code: temp });
    const tempForA = randomCode();
    const forA = await setTemporaryCode(asRpc(freshB), tempForA);
    expect(forA).toMatchObject({ ok: true, targetUserId: w.founder.id });
    const founder = await anonClient().auth.signInWithPassword({
      email: w.founder.email,
      password: tempForA,
    });
    expect(founder.data.user?.app_metadata).toMatchObject({
      r2y_must_change_code: true,
      r2y_founder: true,
      r2y_role: "sposa",
    });
  });

  it("closes the sessions of the target, including a stolen one", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const otherDevice = await signInAs(b.user);
    expect((await otherDevice.auth.getUser()).error).toBeNull();

    await setTemporaryCode(asRpc(w.founderClient), randomCode());

    expect((await otherDevice.auth.getUser()).error).not.toBeNull();
    expect((await b.client.auth.getUser()).error).not.toBeNull();
  });

  it("the event temp_code_set is written first, with the caller as actor, and B sees it", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    await setTemporaryCode(asRpc(w.founderClient), randomCode());
    const events = (await eventsOf(w.weddingId)).filter((event) => event.kind === "temp_code_set");
    expect(events).toEqual([
      { kind: "temp_code_set", actor_id: w.founder.id, target_user_id: b.user.id },
    ]);
  });

  it("works for a pending B that has not entered yet (account created with a code)", async () => {
    const w = await createWedding();
    const email = uniqueEmail("pendingtemp");
    await createPartnerWithCode(asRpc(w.founderClient), { email, code: randomCode() });
    const temp = randomCode();
    expect(await setTemporaryCode(asRpc(w.founderClient), temp)).toMatchObject({ ok: true });
    const entered = await anonClient().auth.signInWithPassword({ email, password: temp });
    expect(entered.data.user?.app_metadata).toMatchObject({ r2y_must_change_code: true });
  });

  it("never reaches a person of another wedding, and refuses a caller with no space", async () => {
    const w1 = await createWedding();
    const w2 = await createWedding();
    const b1 = await addPartnerB(w1);
    expect(await setTemporaryCode(asRpc(w2.founderClient), randomCode())).toEqual({
      ok: false,
      error: "no_account",
    });
    expect(await canSignIn(b1.user.email, b1.user.code)).toBe(true);

    const stranger = await signInAs(await createUser());
    expect(await setTemporaryCode(asRpc(stranger), randomCode())).toEqual({
      ok: false,
      error: "not_partner",
    });
  });
});

describe("createPartnerForEmailInvite", () => {
  const tokenHash = () => hashInviteToken(`token-${Math.random()}`);

  it("creates an account WITHOUT a code and binds it to the email invitation", async () => {
    const w = await createWedding();
    const email = uniqueEmail("byemail");
    const result = await createPartnerForEmailInvite(asRpc(w.founderClient), {
      email,
      tokenHash: tokenHash(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAt).not.toBeNull();
    const [account] = await authUserByEmail(email);
    expect(account?.id).toBe(result.userId);
    expect(account?.last_sign_in_at).toBeFalsy();
    const invitations = await pendingInvitations(w.weddingId);
    expect(invitations).toEqual([
      expect.objectContaining({ email, method: "email", invitee_user_id: result.userId }),
    ]);
    // No password at all: no code, however it is guessed, signs in.
    expect(await canSignIn(email, randomCode())).toBe(false);
  });

  it("refuses a non-reusable address even with a hash chosen by the caller", async () => {
    const w = await createWedding();
    const other = await createWedding();
    expect(
      await createPartnerForEmailInvite(asRpc(w.founderClient), {
        email: other.founder.email,
        tokenHash: tokenHash(),
      }),
    ).toEqual({ ok: false, error: "email_in_use" });
    expect(await canSignIn(other.founder.email, other.founder.code)).toBe(true);
  });
});
