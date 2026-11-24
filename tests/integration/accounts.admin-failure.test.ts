import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  stackEnv,
  uniqueEmail,
} from "../support/supabase";

/**
 * The DB -> admin contract under FAILURE (plan §4.8, code-6 REV-2): the admin step fails (simulated
 * here: the real Auth server answers, but `createUser`/`updateUserById`/`deleteUser` of the admin
 * client return an error) and the state must stay safe and converge when the operation is repeated.
 * Also the ordering rule itself: when the DB refuses, the admin API is NOT called at all.
 */

type AdminCall = "createUser" | "updateUserById" | "deleteUser";
const control = vi.hoisted(() => ({
  failing: new Set<string>(),
  calls: [] as string[],
}));

vi.mock("@/lib/supabase/admin", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/supabase/admin")>("@/lib/supabase/admin");
  return {
    createAdminClient: () => {
      const client = actual.createAdminClient();
      const admin = client.auth.admin as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      for (const name of ["createUser", "updateUserById", "deleteUser"] as const) {
        const real = admin[name]!.bind(admin);
        admin[name] = async (...args: unknown[]) => {
          control.calls.push(name);
          if (control.failing.has(name)) {
            return {
              data: { user: null },
              error: { name: "AuthApiError", message: "simulated failure", status: 400 },
            };
          }
          return real(...args);
        };
      }
      return client;
    },
  };
});

beforeAll(() => {
  const env = stackEnv();
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = env.url;
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = env.publishableKey;
  process.env["SUPABASE_SECRET_KEY"] = env.secretKey;
});

afterEach(() => {
  control.failing.clear();
  control.calls.length = 0;
});

const fail = (...names: AdminCall[]) => names.forEach((name) => control.failing.add(name));
const heal = () => control.failing.clear();
const asRpc = (client: unknown) => client as UserRpc;
const canSignIn = async (email: string, code: string) =>
  (await anonClient().auth.signInWithPassword({ email, password: code })).error === null;
const accountsByEmail = async (email: string) => {
  const { data } = await serviceClient().auth.admin.listUsers({ perPage: 1000 });
  return data.users.filter((user) => user.email === email);
};
const authEmailOf = async (userId: string | null | undefined) => {
  if (!userId) return null;
  const { data } = await serviceClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
};
const invitationsOf = async (weddingId: string) => {
  const { data } = await serviceClient()
    .from("invitations")
    .select("id, email, invitee_user_id, revoked_at, accepted_at")
    .eq("wedding_id", weddingId);
  return data ?? [];
};
const eventKinds = async (weddingId: string) => {
  const { data } = await serviceClient()
    .from("account_events")
    .select("kind")
    .eq("wedding_id", weddingId)
    .order("at");
  return (data ?? []).map((event) => event.kind);
};

describe("create B with a code: the admin step fails", () => {
  it("createUser fails: pending invitation without account, no account, the retry converges", async () => {
    const w = await createWedding();
    const email = uniqueEmail("nocreate");
    const code = randomCode();
    fail("createUser");

    const first = await createPartnerWithCode(asRpc(w.founderClient), { email, code });
    expect(first).toEqual({ ok: false, error: "failed" });
    expect(await accountsByEmail(email)).toHaveLength(0);
    const pending = await invitationsOf(w.weddingId);
    expect(pending).toEqual([expect.objectContaining({ email, invitee_user_id: null })]);
    expect(await canSignIn(email, code)).toBe(false);

    heal();
    const retry = await createPartnerWithCode(asRpc(w.founderClient), { email, code });
    expect(retry.ok).toBe(true);
    expect(await accountsByEmail(email)).toHaveLength(1);
    expect(await invitationsOf(w.weddingId)).toHaveLength(1); // the same invitation, re-delivered
    expect(await canSignIn(email, code)).toBe(true);
  });

  it("the bind step never runs without an account, and updateUserById fails on a reusable account: old code kept, retry converges", async () => {
    const w = await createWedding();
    const b = await createUser();
    const code = randomCode();
    fail("updateUserById");

    const first = await createPartnerWithCode(asRpc(w.founderClient), { email: b.email, code });
    expect(first).toEqual({ ok: false, error: "failed" });
    // The invitation exists and is bound to the account the DB returned; Auth is unchanged.
    // (No sign-in checks here: signing in would make the account non-reusable.)
    expect(await invitationsOf(w.weddingId)).toEqual([
      expect.objectContaining({ email: b.email, invitee_user_id: b.id }),
    ]);

    heal();
    expect(
      await createPartnerWithCode(asRpc(w.founderClient), { email: b.email, code }),
    ).toMatchObject({
      ok: true,
      userId: b.id,
    });
    expect(await canSignIn(b.email, b.code)).toBe(false); // replaced
    expect(await canSignIn(b.email, code)).toBe(true);
  });

  it("an email invite whose account step fails is repeatable and ends bound (no orphan account)", async () => {
    const w = await createWedding();
    const email = uniqueEmail("invitefail");
    fail("createUser");
    const hashA = hashInviteToken("first-token-for-test");
    expect(
      await createPartnerForEmailInvite(asRpc(w.founderClient), { email, tokenHash: hashA }),
    ).toEqual({ ok: false, error: "failed" });
    expect(await accountsByEmail(email)).toHaveLength(0);

    heal();
    const retry = await createPartnerForEmailInvite(asRpc(w.founderClient), {
      email,
      tokenHash: hashInviteToken("second-token-for-test"),
    });
    expect(retry.ok).toBe(true);
    const [invitation] = await invitationsOf(w.weddingId);
    expect(invitation?.invitee_user_id).toBe((await accountsByEmail(email))[0]?.id);
  });
});

describe("change B's pending email: the admin step fails", () => {
  it("compensates: partner row and invitation go back to the old email, B still enters with it", async () => {
    const w = await createWedding();
    const oldEmail = uniqueEmail("old");
    const newEmail = uniqueEmail("new");
    const code = randomCode();
    await w.founderClient.rpc("upsert_partner_b", { p_email: oldEmail });
    await createPartnerWithCode(asRpc(w.founderClient), { email: oldEmail, code });
    fail("updateUserById");

    const result = await updatePendingPartnerEmail(asRpc(w.founderClient), newEmail);
    expect(result).toEqual({ ok: false, error: "failed" });

    const partner = await w.founderClient.from("wedding_partners").select("email").eq("slot", "B");
    expect(partner.data).toEqual([{ email: oldEmail }]);
    const [invitation] = await invitationsOf(w.weddingId);
    expect(invitation?.email).toBe(oldEmail);
    // Auth never moved (signing in to check would make the account non-reusable).
    expect(await authEmailOf(invitation?.invitee_user_id)).toBe(oldEmail);

    heal();
    expect(await updatePendingPartnerEmail(asRpc(w.founderClient), newEmail)).toMatchObject({
      ok: true,
    });
    expect(await canSignIn(oldEmail, code)).toBe(false);
    expect(await canSignIn(newEmail, code)).toBe(true);
  });

  it("if even the compensation is lost (DB on the new email, Auth on the old), repeating converges", async () => {
    const w = await createWedding();
    const oldEmail = uniqueEmail("old2");
    const newEmail = uniqueEmail("new2");
    const code = randomCode();
    await w.founderClient.rpc("upsert_partner_b", { p_email: oldEmail });
    await createPartnerWithCode(asRpc(w.founderClient), { email: oldEmail, code });

    // Simulated crash between the two steps: only step 1 ran.
    const step1 = await w.founderClient.rpc("update_partner_email", {
      p_slot: "B",
      p_email: newEmail,
    });
    expect(step1.error).toBeNull();
    const [invitation] = await invitationsOf(w.weddingId);
    expect(await authEmailOf(invitation?.invitee_user_id)).toBe(oldEmail); // Auth still on the old one

    const repeat = await updatePendingPartnerEmail(asRpc(w.founderClient), newEmail);
    expect(repeat).toMatchObject({ ok: true, oldEmail: newEmail }); // the DB already had it
    expect(await canSignIn(newEmail, code)).toBe(true);
    expect(await canSignIn(oldEmail, code)).toBe(false);
  });

  it("ordering: when the DB refuses (B already joined) the admin API is not called at all", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    control.calls.length = 0;

    const result = await updatePendingPartnerEmail(asRpc(w.founderClient), uniqueEmail("late"));
    expect(result).toEqual({ ok: false, error: "partner_already_joined" });
    expect(control.calls).toEqual([]);
    expect(await canSignIn(b.user.email, b.user.code)).toBe(true);
  });
});

describe("revoke: the admin step fails", () => {
  it("the invitation stays revoked, the account stays, repeating deletes it", async () => {
    const w = await createWedding();
    const email = uniqueEmail("revokefail");
    const code = randomCode();
    const created = await createPartnerWithCode(asRpc(w.founderClient), { email, code });
    if (!created.ok) throw new Error("setup");
    fail("deleteUser");

    expect(await revokePartnerInvitation(asRpc(w.founderClient), created.invitationId)).toEqual({
      ok: false,
      error: "failed",
    });
    const [invitation] = await invitationsOf(w.weddingId);
    expect(invitation?.revoked_at).not.toBeNull();
    expect(await accountsByEmail(email)).toHaveLength(1); // orphan, without membership

    heal();
    expect(await revokePartnerInvitation(asRpc(w.founderClient), created.invitationId)).toEqual({
      ok: true,
      deletedUserId: created.userId,
    });
    expect(await accountsByEmail(email)).toHaveLength(0);
    expect(
      (await eventKinds(w.weddingId)).filter((kind) => kind === "invite_revoked"),
    ).toHaveLength(1);
  });

  it("ordering: after acceptance the DB refuses and deleteUser is never called", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    const [invitation] = await invitationsOf(w.weddingId);
    control.calls.length = 0;

    const result = await revokePartnerInvitation(asRpc(w.founderClient), invitation!.id);
    expect(result).toEqual({ ok: false, error: "already_accepted" });
    expect(control.calls).toEqual([]);
    expect(await canSignIn(b.user.email, b.user.code)).toBe(true);
  });
});

describe("temporary code: the admin step fails", () => {
  it("the event exists (a spare warning is safe) but the code did not change", async () => {
    const w = await createWedding();
    const b = await addPartnerB(w);
    fail("updateUserById");

    const result = await setTemporaryCode(asRpc(w.founderClient), randomCode());
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(await canSignIn(b.user.email, b.user.code)).toBe(true); // password untouched
    expect(await eventKinds(w.weddingId)).toContain("temp_code_set");
  });

  it("ordering: with no one to target, the DB says no and the admin API is not called", async () => {
    const w = await createWedding(); // no partner B yet
    const result = await setTemporaryCode(asRpc(w.founderClient), randomCode());
    expect(result).toEqual({ ok: false, error: "no_account" });
    expect(control.calls).toEqual([]);
    expect(await eventKinds(w.weddingId)).toEqual([]);
  });
});
