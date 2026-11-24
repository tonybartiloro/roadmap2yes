import { beforeAll, describe, expect, it } from "vitest";
import { changeOwnCode, changeOwnEmail, type UserRpc } from "@/features/accounts/admin-ops";
import {
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
 * Own-account operations (plan §4.5.3, §4.6, §4.8) against the real stack: the DB step with the
 * user's JWT, then the admin step on the id the DB returned. `admin-ops.ts` reads the stack from
 * the environment like the app does.
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

describe("changeOwnCode", () => {
  it("sets the new code and clears the forced flag in one step, keeping founder and role", async () => {
    const w = await createWedding("sposa");
    await serviceClient().auth.admin.updateUserById(w.founder.id, {
      app_metadata: { r2y_must_change_code: true },
    });
    const newCode = randomCode();

    const result = await changeOwnCode(asRpc(w.founderClient), w.founder.id, newCode);
    expect(result).toEqual({ ok: true, userId: w.founder.id });

    expect(await canSignIn(w.founder.email, w.founder.code)).toBe(false); // AC56: the old one stops working
    const fresh = anonClient();
    const { data, error } = await fresh.auth.signInWithPassword({
      email: w.founder.email,
      password: newCode,
    });
    expect(error).toBeNull();
    expect(data.user?.app_metadata).toMatchObject({
      r2y_must_change_code: false,
      r2y_founder: true,
      r2y_role: "sposa",
    });
  });

  it("the DB writes the event BEFORE the change (code_changed, actor = the caller)", async () => {
    const w = await createWedding();
    await changeOwnCode(asRpc(w.founderClient), w.founder.id, randomCode());
    const { data } = await serviceClient()
      .from("account_events")
      .select("kind, actor_id, target_user_id")
      .eq("wedding_id", w.weddingId);
    expect(data).toEqual([
      { kind: "code_changed", actor_id: w.founder.id, target_user_id: w.founder.id },
    ]);
  });

  it("the admin update closes the existing sessions (the app signs in again afterwards)", async () => {
    const w = await createWedding();
    const other = await signInAs(w.founder); // another device of the same person
    expect((await other.auth.getUser()).error).toBeNull();

    await changeOwnCode(asRpc(w.founderClient), w.founder.id, randomCode());

    expect((await other.auth.getUser()).error).not.toBeNull();
    expect((await w.founderClient.auth.getUser()).error).not.toBeNull();
  });

  it("never acts on an id other than the caller's", async () => {
    const w = await createWedding();
    const victim = await createUser();
    const result = await changeOwnCode(asRpc(w.founderClient), victim.id, randomCode());
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(await canSignIn(victim.email, victim.code)).toBe(true);
  });

  it("a person without a space can still change their OWN code (no event: there is no space)", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    const newCode = randomCode();
    expect(await changeOwnCode(asRpc(client), user.id, newCode)).toEqual({
      ok: true,
      userId: user.id,
    });
    expect(await canSignIn(user.email, newCode)).toBe(true);
    expect(await canSignIn(user.email, user.code)).toBe(false);
  });

  it("without a session the DB refuses and nothing changes", async () => {
    const user = await createUser();
    const result = await changeOwnCode(asRpc(anonClient()), user.id, randomCode());
    expect(result.ok).toBe(false);
    expect(await canSignIn(user.email, user.code)).toBe(true);
  });
});

describe("changeOwnEmail", () => {
  it("changes the login email without any confirmation email; the old one stops working", async () => {
    const w = await createWedding();
    const next = uniqueEmail("renamed");

    const result = await changeOwnEmail(asRpc(w.founderClient), w.founder.id, next);
    expect(result).toEqual({
      ok: true,
      userId: w.founder.id,
      oldEmail: w.founder.email,
      newEmail: next,
    });

    expect(await canSignIn(next, w.founder.code)).toBe(true);
    expect(await canSignIn(w.founder.email, w.founder.code)).toBe(false);
  });

  it("sync_my_email aligns the partner row, and the event email_changed exists", async () => {
    const w = await createWedding();
    const next = uniqueEmail("synced");
    await changeOwnEmail(asRpc(w.founderClient), w.founder.id, next);

    const session = await signInAs({ email: next, code: w.founder.code });
    expect((await session.rpc("sync_my_email")).data).toBe(next);
    const row = await session.from("wedding_partners").select("email").eq("user_id", w.founder.id);
    expect(row.data).toEqual([{ email: next }]);

    const events = await serviceClient()
      .from("account_events")
      .select("kind")
      .eq("wedding_id", w.weddingId);
    expect(events.data).toEqual([{ kind: "email_changed" }]);
  });

  it("refuses an address that already has an account, and the same address", async () => {
    const w = await createWedding();
    const taken = await createUser();
    expect(await changeOwnEmail(asRpc(w.founderClient), w.founder.id, taken.email)).toEqual({
      ok: false,
      error: "email_in_use",
    });
    expect(await changeOwnEmail(asRpc(w.founderClient), w.founder.id, w.founder.email)).toEqual({
      ok: false,
      error: "same_email",
    });
    expect(await canSignIn(w.founder.email, w.founder.code)).toBe(true);
    expect(await canSignIn(taken.email, taken.code)).toBe(true);
  });

  it("never acts on an id other than the caller's", async () => {
    const w = await createWedding();
    const victim = await createUser();
    const result = await changeOwnEmail(asRpc(w.founderClient), victim.id, uniqueEmail("hijack"));
    expect(result).toEqual({ ok: false, error: "failed" });
    expect(await canSignIn(victim.email, victim.code)).toBe(true);
  });

  it("a person without a space has no wedding to write the event in: refused (not_partner)", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    expect(await changeOwnEmail(asRpc(client), user.id, uniqueEmail("nospace"))).toEqual({
      ok: false,
      error: "not_partner",
    });
  });
});
