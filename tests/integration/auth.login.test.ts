import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { limitedPasswordLogin, type LoginDeps } from "@/features/auth/login";
import { resolvePostLogin } from "@/features/auth/post-login";
import {
  anonClient,
  createUser,
  createWedding,
  serviceClient,
  signInAs,
  stackEnv,
} from "../support/supabase";

/**
 * Login limiter and post-login steps against the REAL local stack (plan §4.3): real RPCs
 * (`login_gate`/`login_record`), real GoTrue. Each test uses its own email and its own fake IP,
 * so no test locks another one out.
 */

const fakeIp = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

function deps(over: Partial<LoginDeps["limits"]> = {}): LoginDeps {
  return {
    limiter: serviceClient() as unknown as LoginDeps["limiter"],
    secret: stackEnv().secretKey,
    limits: {
      maxFailuresPerEmail: 5,
      maxFailuresPerIp: 20,
      lockMinutes: 15,
      windowMinutes: 15,
      ...over,
    },
  };
}

const attempt = (email: string, code: string, ip: string, limits?: Partial<LoginDeps["limits"]>) =>
  limitedPasswordLogin(anonClient().auth, { email, code, ip }, deps(limits));

describe("limitedPasswordLogin against the real stack", () => {
  it("a correct email and code enter", async () => {
    const user = await createUser();
    const outcome = await attempt(user.email, user.code, fakeIp());
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") expect(outcome.user.email).toBe(user.email);
  });

  it("unknown email and wrong code get the SAME neutral outcome", async () => {
    const user = await createUser();
    const ip = fakeIp();
    const unknown = await attempt("nobody.here@example.test", "Wrong-code-123", ip);
    const wrong = await attempt(user.email, "Wrong-code-123", ip);
    expect(unknown).toEqual({ status: "invalid" });
    expect(wrong).toEqual({ status: "invalid" });
  });

  it("5 failures lock the email for everyone, existing or not, even with the right code", async () => {
    const user = await createUser();
    const ip = fakeIp();
    for (let i = 0; i < 5; i += 1) {
      expect(await attempt(user.email, "Wrong-code-123", ip)).toEqual({ status: "invalid" });
    }
    expect(await attempt(user.email, user.code, ip)).toEqual({ status: "blocked" });

    const ghost = "ghost." + randomBytes(4).toString("hex") + "@example.test";
    for (let i = 0; i < 5; i += 1) await attempt(ghost, "Wrong-code-123", fakeIp());
    expect(await attempt(ghost, "Wrong-code-123", fakeIp())).toEqual({ status: "blocked" });
  });

  it("a success clears the email counter (only below the threshold)", async () => {
    const user = await createUser();
    const ip = fakeIp();
    for (let i = 0; i < 4; i += 1) await attempt(user.email, "Wrong-code-123", ip);
    expect((await attempt(user.email, user.code, ip)).status).toBe("ok");
    for (let i = 0; i < 4; i += 1) {
      expect(await attempt(user.email, "Wrong-code-123", ip)).toEqual({ status: "invalid" });
    }
    expect((await attempt(user.email, user.code, ip)).status).toBe("ok");
  });

  it("the IP key blocks other emails from the same address, and only that address", async () => {
    const ip = fakeIp();
    const limits = { maxFailuresPerIp: 3 };
    for (let i = 0; i < 3; i += 1) {
      await attempt(
        `probe${i}.${randomBytes(3).toString("hex")}@example.test`,
        "Wrong-code-123",
        ip,
        limits,
      );
    }
    const user = await createUser();
    expect(await attempt(user.email, user.code, ip, limits)).toEqual({ status: "blocked" });
    expect((await attempt(user.email, user.code, fakeIp(), limits)).status).toBe("ok");
  });
});

describe("resolvePostLogin against the real stack", () => {
  it("the founder without a space gets one, and goes to the onboarding", async () => {
    const founder = await createUser({ founder: true, role: "sposa" });
    const client = await signInAs(founder);
    const { data } = await client.auth.getUser();
    const me = { id: founder.id, app_metadata: data.user?.app_metadata ?? {} };
    const result = await resolvePostLogin(client, me);
    expect(result).toEqual({ status: "ok", to: "/onboarding" });
    // idempotent: a second login does not create a second space
    const again = await resolvePostLogin(client, me);
    expect(again).toEqual({ status: "ok", to: "/onboarding" });
    const weddings = await client.from("weddings").select("id");
    expect(weddings.data).toHaveLength(1);
  });

  it("someone who is not the founder and has no invitation: 'su invito', nothing created", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    expect(await resolvePostLogin(client, { id: user.id, app_metadata: {} })).toEqual({
      status: "ok",
      to: "/su-invito",
    });
    expect((await client.from("memberships").select("wedding_id")).data).toEqual([]);
    expect((await client.rpc("create_wedding")).error?.message).toBe("not_founder");
  });

  it("B with a pending invitation enters A's space and never sees the creation", async () => {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    const inv = await w.founderClient.rpc("create_invitation", {
      p_email: b.email,
      p_method: "code",
      p_invitee_user_id: b.id,
    });
    expect(inv.error).toBeNull();
    const client = await signInAs(b);
    expect(await resolvePostLogin(client, { id: b.id, app_metadata: {} })).toEqual({
      status: "ok",
      to: "/",
    });
    const memberships = await client
      .from("memberships")
      .select("wedding_id, partner_slot")
      .eq("user_id", b.id);
    expect(memberships.data).toEqual([{ wedding_id: w.weddingId, partner_slot: "B" }]);
  });

  it("a temporary code sends B to the forced change, after the invitation was accepted", async () => {
    const w = await createWedding();
    const b = await createUser();
    await w.founderClient.rpc("upsert_partner_b", { p_email: b.email });
    await w.founderClient.rpc("create_invitation", {
      p_email: b.email,
      p_method: "code",
      p_invitee_user_id: b.id,
    });
    const client = await signInAs(b);
    const result = await resolvePostLogin(client, {
      id: b.id,
      app_metadata: { r2y_must_change_code: true },
    });
    expect(result).toEqual({ status: "ok", to: "/altro/account?obbligatorio=1" });
    const own = await client.from("memberships").select("wedding_id").eq("user_id", b.id);
    expect(own.data).toEqual([{ wedding_id: w.weddingId }]);
  });
});
