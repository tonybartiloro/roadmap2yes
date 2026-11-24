import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient,
  authFetch,
  createUser,
  serviceClient,
  signInAs,
  stackEnv,
  uniqueEmail,
  type TestClient,
  type TestUser,
} from "../support/supabase";
import {
  catalogFromOpenApi,
  fetchOpenApi,
  FUNCTIONS,
  loadCatalog,
  loose,
  TABLES,
  type Catalog,
} from "./support/matrix";

/**
 * QA T17a: EXECUTE for anon/authenticated/secret key against the allowlist, generated from the
 * catalog; `private` not exposed; closed registration; no admin API for ordinary keys.
 * SQL twin: supabase/tests/qa_catalog_matrix.test.sql. AC1, AC2 (rif.), AC10.
 */

const DENIED = /permission denied for function/i;
const newCode = () => `Code${randomBytes(6).toString("hex")}x9`;

/** Calls a function by name with dummy args; returns the error (or null). Never relies on success. */
async function call(client: TestClient, name: string, args: Record<string, unknown>) {
  const result = await loose(client).rpc(name, args);
  return result.error;
}

describe("EXECUTE allowlist through the API (generated from the catalog)", () => {
  let catalog: Catalog;
  let plain: TestUser;
  let user: TestClient;

  beforeAll(async () => {
    catalog = await loadCatalog();
    plain = await createUser();
    user = await signInAs(plain);
  });

  const argsFor = (name: string): Record<string, unknown> => ({
    ...catalog.args[name],
    // the only function that writes a row on its own: keep it harmless and identifiable
    ...(name === "record_heartbeat" ? { p_source: "qa-grants" } : {}),
  });

  it("every function in public has a matrix entry, and every entry exists (a new one fails CI)", () => {
    expect(catalog.functions).toEqual(Object.keys(FUNCTIONS).sort());
  });

  it("every table in public has a matrix entry, and every entry exists (a new one fails CI)", () => {
    expect(catalog.tables).toEqual(Object.keys(TABLES).sort());
  });

  it.each(Object.keys(FUNCTIONS))("anon cannot execute %s", async (name) => {
    const error = await call(anonClient(), name, argsFor(name));
    expect(error?.code, name).toBe("42501");
    expect(error?.message, name).toMatch(DENIED);
  });

  it.each(Object.entries(FUNCTIONS))(
    "authenticated vs %s (%s): executes only the allowlisted ones",
    async (name, klass) => {
      const error = await call(user, name, argsFor(name));
      if (klass === "service") {
        expect(error?.code, name).toBe("42501");
        expect(error?.message, name).toMatch(DENIED);
      } else {
        // allowed to EXECUTE: whatever it answers (validation, not_found...), never a privilege error on the function
        expect(error?.message ?? "", name).not.toMatch(DENIED);
      }
    },
  );

  it.each(Object.keys(FUNCTIONS))("the secret key can execute %s", async (name) => {
    const error = await call(serviceClient(), name, argsFor(name));
    expect(error?.message ?? "", name).not.toMatch(DENIED);
  });

  it("the surface PostgREST advertises matches the roles: anon sees nothing, a user sees no service function or table", async () => {
    const { publishableKey } = stackEnv();
    const jwt = (await user.auth.getSession()).data.session!.access_token;
    const anonSurface = catalogFromOpenApi(await fetchOpenApi(publishableKey));
    expect(anonSurface.tables).toEqual([]);
    expect(anonSurface.functions).toEqual([]);
    const userSurface = catalogFromOpenApi(await fetchOpenApi(publishableKey, jwt));
    expect(userSurface.functions).toEqual(
      Object.entries(FUNCTIONS)
        .filter(([, k]) => k === "user")
        .map(([n]) => n)
        .sort(),
    );
    expect(userSurface.tables).toEqual(
      Object.entries(TABLES)
        .filter(([, s]) => s.select)
        .map(([n]) => n)
        .sort(),
    );
    for (const hidden of ["heartbeats", "notification_log"])
      expect(userSurface.tables).not.toContain(hidden);
  });

  it("the account-event helper is not an API function at all (REV-3)", async () => {
    expect(catalog.functions).not.toContain("record_account_event");
    const { error } = await loose(serviceClient()).rpc("record_account_event", {
      p_kind: "temp_code_set",
    });
    expect(error?.code).toBe("PGRST202");
  });
});

describe("the private schema is not exposed", () => {
  it.each([
    ["anon", () => anonClient()],
    ["secret key", () => serviceClient()],
  ])("%s: .schema('private') is refused (PGRST106)", async (_who, make) => {
    for (const table of ["login_attempts", "role_permissions"]) {
      const { error } = await loose(make()).schema("private").from(table).select("*");
      expect(error?.code, table).toBe("PGRST106");
    }
  });

  it("authenticated: .schema('private') is refused too, tables and functions", async () => {
    const client = await signInAs(await createUser());
    expect(
      (await loose(client).schema("private").from("login_attempts").select("*")).error?.code,
    ).toBe("PGRST106");
    expect(
      (await loose(client).schema("private").rpc("record_account_event", {})).error?.code,
    ).toBe("PGRST106");
  });

  it("raw profile headers cannot reach it either (GET, POST)", async () => {
    const { url, publishableKey, secretKey } = stackEnv();
    for (const key of [publishableKey, secretKey]) {
      const get = await fetch(`${url}/rest/v1/login_attempts`, {
        headers: { apikey: key, "Accept-Profile": "private" },
      });
      expect(get.status).toBe(406);
      expect(((await get.json()) as { code: string }).code).toBe("PGRST106");
      const post = await fetch(`${url}/rest/v1/rpc/account_reusable`, {
        method: "POST",
        headers: { apikey: key, "content-type": "application/json", "Content-Profile": "private" },
        body: "{}",
      });
      expect(post.status).toBe(406);
    }
  });

  it("a user cannot call a private helper through the public schema", async () => {
    const client = await signInAs(await createUser());
    for (const fn of [
      "account_reusable",
      "record_account_event",
      "norm_email",
      "rome_today",
      "add_date_offset",
    ]) {
      const { error } = await loose(client).rpc(fn, {});
      expect(error?.code, fn).toBe("PGRST202");
    }
  });
});

describe("closed registration and no admin API for ordinary keys (AC2 rif.)", () => {
  it("signUp with the publishable key is refused and creates no account", async () => {
    const email = uniqueEmail("qa.signup");
    const direct = await authFetch("/signup", { email, password: newCode() });
    expect(direct.status).toBeGreaterThanOrEqual(400);
    expect(direct.status).toBeLessThan(500);
    const viaClient = await anonClient().auth.signUp({
      email: uniqueEmail("qa.signup2"),
      password: newCode(),
    });
    expect(viaClient.error).not.toBeNull();
    expect(viaClient.data.session).toBeNull();
    expect(
      (await serviceClient().rpc("auth_user_id_by_email", { p_email: email })).data,
    ).toBeNull();
  });

  it("an e-mail one-time-code request cannot create an account for an unknown address", async () => {
    const email = uniqueEmail("qa.otp");
    const otp = await authFetch("/otp", { email, create_user: true });
    expect(otp.status).toBeGreaterThanOrEqual(400);
    expect(
      (await serviceClient().rpc("auth_user_id_by_email", { p_email: email })).data,
    ).toBeNull();
  });

  it("the admin endpoints refuse the publishable key and a user's JWT", async () => {
    const { url, publishableKey } = stackEnv();
    const client = await signInAs(await createUser());
    const jwt = (await client.auth.getSession()).data.session!.access_token;
    const headerSets: Record<string, string>[] = [
      { apikey: publishableKey },
      { apikey: publishableKey, authorization: `Bearer ${jwt}` },
    ];
    for (const headers of headerSets) {
      const list = await fetch(`${url}/auth/v1/admin/users`, { headers });
      expect([401, 403]).toContain(list.status);
      const create = await fetch(`${url}/auth/v1/admin/users`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          email: uniqueEmail("qa.admin"),
          password: newCode(),
          email_confirm: true,
        }),
      });
      expect([401, 403]).toContain(create.status);
      const del = await fetch(`${url}/auth/v1/admin/users/${randomUUID()}`, {
        method: "DELETE",
        headers,
      });
      expect([401, 403]).toContain(del.status);
    }
  });

  it("a user cannot make themselves a founder: app_metadata is not writable through GoTrue", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    const { url, publishableKey } = stackEnv();
    const jwt = (await client.auth.getSession()).data.session!.access_token;
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ app_metadata: { r2y_founder: true } }),
    });
    expect(response.status).toBeLessThan(500);
    const again = await signInAs(user);
    expect((await again.auth.getUser()).data.user?.app_metadata["r2y_founder"]).toBeUndefined();
    expect((await again.rpc("create_wedding")).error?.message).toBe("not_founder");
  });

  it("(P2, needs the Auth settings of supabase/config.toml loaded by the running stack) a direct PUT /user e-mail change is not applied without confirmation", async () => {
    const user = await createUser();
    const client = await signInAs(user);
    const target = uniqueEmail("qa.moved");
    const { error } = await client.auth.updateUser({ email: target });
    expect(error?.status ?? 200).toBeLessThan(500);
    const stored = await serviceClient().auth.admin.getUserById(user.id);
    expect(stored.data.user?.email, "email must still be the original one").toBe(user.email);
    // the old address still signs in, the new one does not
    await expect(signInAs(user)).resolves.toBeDefined();
    const wrong = await anonClient().auth.signInWithPassword({
      email: target,
      password: user.code,
    });
    expect(wrong.error).not.toBeNull();
  });
});
