import { describe, expect, it } from "vitest";
import { anonClient, authFetch, createUser, randomCode, serviceClient, signInAs, uniqueEmail } from "../support/supabase";

/**
 * The local Auth server (supabase/config.toml) enforces what the plan §4.1 promises, also for
 * direct API calls: closed signup, access code >= 10 characters with letters and digits.
 */
describe("local Auth: signup closed and access-code policy", () => {
  it("refuses public signup (422 signup_disabled) and creates no user", async () => {
    const email = uniqueEmail("signup");
    const { status, json } = await authFetch("/signup", { email, password: randomCode() });
    expect(status).toBe(422);
    expect(json["error_code"]).toBe("signup_disabled");

    const { data } = await serviceClient().rpc("auth_user_id_by_email", { p_email: email });
    expect(data).toBeNull();
  });

  it("refuses anonymous sign-ins", async () => {
    const { status, json } = await authFetch("/signup", {});
    expect(status).toBeGreaterThanOrEqual(400);
    expect(json["error_code"]).toBeDefined();
  });

  it.each([
    ["9 characters", "abcde1234"],
    ["letters only (12)", "abcdefghijkl"],
    ["digits only (12)", "123456789012"],
  ])("rejects a weak code on user creation: %s", async (_label, password) => {
    const { error } = await serviceClient().auth.admin.createUser({
      email: uniqueEmail("weak"),
      password,
      email_confirm: true,
    });
    expect(error?.code).toBe("weak_password");
  });

  it("rejects a weak code when a signed-in user changes it", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    for (const password of ["abcde1234", "abcdefghijkl"]) {
      const { error } = await client.auth.updateUser({ password });
      expect(error?.code).toBe("weak_password");
    }
    // the old code is still valid
    await expect(signInAs(user)).resolves.toBeDefined();
  });

  it("accepts a 10-character code with letters and digits and refuses a wrong one neutrally", async () => {
    const user = await createUser({ code: "abcde12345" });
    await expect(signInAs(user)).resolves.toBeDefined();

    const wrong = await anonClient().auth.signInWithPassword({ email: user.email, password: "abcde12346" });
    const unknown = await anonClient().auth.signInWithPassword({ email: uniqueEmail("nobody"), password: "abcde12346" });
    expect(wrong.error?.code).toBe("invalid_credentials");
    expect(unknown.error?.code).toBe("invalid_credentials");
    expect(unknown.error?.message).toBe(wrong.error?.message);
  });
});
