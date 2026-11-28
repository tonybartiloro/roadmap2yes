import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Proves each ESLint guard (plan §12): the same fixture is linted under a virtual path, so the
 * path-based rule (admin.ts allowed scopes) can be checked without creating real files in src/.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const root = process.cwd();

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "cases", `${name}.fixture`), "utf8");
}

async function ruleIds(name: string, virtualPath: string): Promise<string[]> {
  const [result] = await eslint.lintText(fixture(name), { filePath: join(root, virtualPath) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal:${m.message}`);
}

beforeAll(() => {
  expect(eslint).toBeDefined();
});

describe("guard: 'use cache' ban", () => {
  it.each(["use-cache-file", "use-cache-function"])("rejects %s", async (name) => {
    expect(await ruleIds(name, "src/app/(app)/page.tsx")).toContain("r2y/no-use-cache");
  });
  it("rejects next/cache unstable_cache, even in an admin-allowed scope", async () => {
    expect(await ruleIds("next-cache-import", "src/features/home/x.ts")).toContain(
      "no-restricted-imports",
    );
    expect(await ruleIds("next-cache-import", "src/features/jobs/x.ts")).toContain(
      "no-restricted-imports",
    );
  });
  it("accepts unrelated directives and revalidatePath", async () => {
    expect(await ruleIds("use-cache-ok", "src/features/home/x.ts")).toEqual([]);
    expect(await ruleIds("next-cache-ok", "src/features/home/x.ts")).toEqual([]);
  });
});

describe("guard: text-accent ban", () => {
  it.each(["text-accent-literal", "text-accent-variants", "text-accent-template"])(
    "rejects %s",
    async (name) => {
      expect(await ruleIds(name, "src/components/X.tsx")).toContain("r2y/no-text-accent");
    },
  );
  it("accepts accent on borders/backgrounds and unrelated classes", async () => {
    expect(await ruleIds("text-accent-ok", "src/components/X.tsx")).toEqual([]);
  });
});

describe("guard: lib/supabase/admin.ts import scopes", () => {
  const forbidden = [
    "src/app/(app)/page.tsx",
    "src/app/(app)/altro/account/actions.ts",
    "src/features/auth/guards.ts",
    "src/features/auth/post-login.ts",
    "src/features/settings/actions.ts",
    "src/features/accounts/other.ts",
    "src/lib/email/index.ts",
    "src/proxy.ts",
    // R-04: only public-rpc.ts is the fifth scope, not the rest of features/rsvp (ADR-0003).
    "src/features/rsvp/actions.ts",
    "src/features/rsvp/data.ts",
    "src/features/rsvp/public-actions.ts",
    "src/features/rsvp/public/RsvpForm.tsx",
    "src/features/rsvp/limiter.ts",
    "src/app/(public)/rsvp/[token]/page.tsx",
  ];
  const allowed = [
    "src/features/auth/login.ts",
    "src/features/auth/bootstrap.ts",
    "src/features/accounts/admin-ops.ts",
    "src/features/jobs/run-daily-job.ts",
    "src/features/jobs/nested/deeper.ts",
    "src/app/(public)/email/disattiva/actions.ts",
    "src/features/rsvp/public-rpc.ts",
  ];

  it.each([
    "admin-import-alias",
    "admin-import-relative",
    "admin-import-ts-extension",
    "admin-reexport",
  ])("rejects %s from every non-allowed scope", async (name) => {
    for (const path of forbidden) {
      expect(await ruleIds(name, path), `${name} in ${path}`).toContain("no-restricted-imports");
    }
  });

  it.each(["admin-import-dynamic", "admin-require"])(
    "rejects %s (dynamic forms) too",
    async (name) => {
      expect(await ruleIds(name, "src/features/settings/actions.ts")).toContain(
        "r2y/no-admin-dynamic-import",
      );
    },
  );

  it("accepts the dynamic form in an allowed scope", async () => {
    expect(await ruleIds("admin-import-dynamic", "src/features/jobs/x.ts")).toEqual([]);
  });

  it("rejects the dynamic form in the rest of features/rsvp (only public-rpc.ts is allowed)", async () => {
    expect(await ruleIds("admin-import-dynamic", "src/features/rsvp/actions.ts")).toContain(
      "r2y/no-admin-dynamic-import",
    );
  });

  it.each(["admin-import-alias", "admin-import-relative"])(
    "accepts %s in the 5 allowed scopes",
    async (name) => {
      for (const path of allowed) {
        expect(await ruleIds(name, path), `${name} in ${path}`).toEqual([]);
      }
    },
  );
});
