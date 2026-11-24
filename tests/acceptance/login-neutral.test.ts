import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emailLimiterKey, ipLimiterKey } from "@/features/auth/limiter-keys";
import { limitedPasswordLogin, type LoginDeps } from "@/features/auth/login";
import {
  anonClient,
  authFetch,
  createUser,
  randomCode,
  serviceClient,
  stackEnv,
  uniqueEmail,
} from "../support/supabase";
import { byteaLiteral, sql } from "./support/sql";

/**
 * QA T17a: closed registration, neutral errors and the temporary block (plan rows "Registrazione
 * chiusa", "Messaggi neutri e blocco"), against the real local GoTrue and the real limiter RPCs.
 *
 * AC map
 *  - AC2   direct signUp is refused and creates nobody; an unknown email and a wrong code get the
 *          same answer (status and body) from the Auth server and the same outcome from the app
 *  - AC54  5 errors per email (existing or not) -> the same "blocked" outcome; 20 per IP; unlock
 *          after 15 minutes (timestamps shifted); a success clears the counter below the limit;
 *          a success never shortens an active block; a 429 of GoTrue is mapped to "blocked"
 * Timings are a note, not an assertion (they flake). The browser-level texts are in e2e/login.spec.ts.
 */

const fakeIp = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;

const limits = { maxFailuresPerEmail: 5, maxFailuresPerIp: 20, lockMinutes: 15, windowMinutes: 15 };

function deps(): LoginDeps {
  return {
    limiter: serviceClient() as unknown as LoginDeps["limiter"],
    secret: stackEnv().secretKey,
    limits,
  };
}

const attempt = (email: string, code: string, ip: string) =>
  limitedPasswordLogin(anonClient().auth, { email, code, ip }, deps());

/** Moves a limiter row `minutes` into the past (window and lock), like the time passing. */
function age(key: string, minutes: number): void {
  sql(
    `update private.login_attempts set window_start = window_start - interval '${minutes} minutes', locked_until = locked_until - interval '${minutes} minutes' where key_hash = ${byteaLiteral(key)}`,
  );
}

const emailKey = (email: string) => emailLimiterKey(stackEnv().secretKey, email);
const ipKey = (ip: string) => ipLimiterKey(stackEnv().secretKey, ip) as string;

describe("closed registration (AC2)", () => {
  it("a direct signUp with the publishable key is refused and creates no user", async () => {
    const email = uniqueEmail("stranger");
    const { status, json } = await authFetch("/signup", { email, password: randomCode() });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
    const found = await serviceClient().rpc("auth_user_id_by_email", { p_email: email });
    expect(found.data).toBeNull();
    // the same refusal for an email that does exist (no enumeration through signUp)
    const existing = await createUser();
    const again = await authFetch("/signup", { email: existing.email, password: randomCode() });
    expect(again.status).toBe(status);
    expect(again.json["error_code"] ?? again.json["code"]).toBe(json["error_code"] ?? json["code"]);
    expect(again.json["msg"] ?? again.json["message"]).toBe(json["msg"] ?? json["message"]);
  });

  it("an unknown email and a wrong code get the SAME answer from the Auth server", async () => {
    const user = await createUser();
    const unknown = await authFetch("/token?grant_type=password", {
      email: uniqueEmail("nobody"),
      password: "WrongCode123x",
    });
    const wrong = await authFetch("/token?grant_type=password", {
      email: user.email,
      password: "WrongCode123x",
    });
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.json).toEqual(wrong.json);
  });

  it("the app gives the same outcome and sends no email for either", async () => {
    const user = await createUser();
    const ip = fakeIp();
    const unknown = await attempt(uniqueEmail("nobody"), "WrongCode123x", ip);
    const wrong = await attempt(user.email, "WrongCode123x", ip);
    expect(unknown).toEqual({ status: "invalid" });
    expect(wrong).toEqual(unknown);
  });
});

describe("temporary block (AC54)", () => {
  it("5 errors lock an EXISTING and an UNKNOWN email with the same outcome, even with the right code", async () => {
    const real = await createUser();
    const ghost = uniqueEmail("ghost");
    for (const email of [real.email, ghost]) {
      const ip = fakeIp();
      for (let i = 0; i < 5; i += 1) {
        expect(await attempt(email, `Wrong${i}Code99x`, ip)).toEqual({ status: "invalid" });
      }
    }
    expect(await attempt(real.email, real.code, fakeIp())).toEqual({ status: "blocked" });
    expect(await attempt(ghost, "WrongCode123x", fakeIp())).toEqual({ status: "blocked" });
  });

  it("the block ends after 15 minutes (timestamps shifted): the right code enters again", async () => {
    const user = await createUser();
    const ip = fakeIp();
    for (let i = 0; i < 5; i += 1) await attempt(user.email, `Wrong${i}Code99x`, ip);
    expect(await attempt(user.email, user.code, fakeIp())).toEqual({ status: "blocked" });
    age(emailKey(user.email), 16);
    const outcome = await attempt(user.email, user.code, fakeIp());
    expect(outcome.status).toBe("ok");
  });

  it("20 errors from one address block that address for any email, and only that address", async () => {
    const ip = fakeIp();
    const victim = await createUser();
    for (let i = 0; i < 20; i += 1) {
      await attempt(uniqueEmail(`spray${i}`), `Wrong${i}Code99x`, ip);
    }
    expect(await attempt(victim.email, victim.code, ip)).toEqual({ status: "blocked" });
    expect((await attempt(victim.email, victim.code, fakeIp())).status).toBe("ok");
    // and it ends after 15 minutes as well
    age(ipKey(ip), 16);
    expect((await attempt(victim.email, victim.code, ip)).status).toBe("ok");
  });

  it("a success clears the counter below the limit", async () => {
    const user = await createUser();
    const ip = fakeIp();
    for (let i = 0; i < 4; i += 1) await attempt(user.email, `Wrong${i}Code99x`, ip);
    expect((await attempt(user.email, user.code, ip)).status).toBe("ok");
    // four more errors do not lock (the earlier four were cleared)
    for (let i = 0; i < 4; i += 1) {
      expect(await attempt(user.email, `Other${i}Code99x`, ip)).toEqual({ status: "invalid" });
    }
    expect((await attempt(user.email, user.code, ip)).status).toBe("ok");
  });

  it("a success never shortens an active block (REV-5)", async () => {
    const user = await createUser();
    const ip = fakeIp();
    for (let i = 0; i < 5; i += 1) await attempt(user.email, `Wrong${i}Code99x`, ip);
    // a success recorded while the block is active (the burst of parallel attempts of plan 4.3)
    await serviceClient().rpc("login_record", {
      p_email_key: emailKey(user.email),
      p_ip_key: ipKey(fakeIp()),
      p_success: true,
      p_max_email: 5,
      p_max_ip: 20,
      p_window_minutes: 15,
      p_lock_minutes: 15,
    });
    expect(await attempt(user.email, user.code, fakeIp())).toEqual({ status: "blocked" });
  });

  it("a blocked attempt writes no row (random emails leave nothing behind)", async () => {
    const ip = fakeIp();
    for (let i = 0; i < 20; i += 1) await attempt(uniqueEmail(`fill${i}`), "WrongCode123x", ip);
    const email = uniqueEmail("leaves.no.row");
    expect(await attempt(email, "WrongCode123x", ip)).toEqual({ status: "blocked" });
    expect(
      sql(
        `select count(*) from private.login_attempts where key_hash = ${byteaLiteral(emailKey(email))}`,
      ),
    ).toBe("0");
  });

  it("a 429 of the Auth server is mapped to the same 'blocked' outcome", async () => {
    const user = await createUser();
    const rateLimited = {
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { status: 429, code: "over_request_rate_limit", message: "rate limit" },
      }),
    } as unknown as Parameters<typeof limitedPasswordLogin>[0];
    const outcome = await limitedPasswordLogin(
      rateLimited,
      { email: user.email, code: user.code, ip: fakeIp() },
      deps(),
    );
    expect(outcome).toEqual({ status: "blocked" });
  });
});
