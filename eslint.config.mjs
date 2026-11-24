import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Project guards (plan §1, §12; ADR-0001 "Compliance"). Each one is proven by a fixture in
 * `tests/lint-fixtures/` (run by `tests/lint-fixtures/guards.test.ts`):
 *   1. `use cache` ban (no shared cache of user data, plan §1);
 *   2. `text-accent` ban (design §3: accent is graphic only, never text);
 *   3. `lib/supabase/admin.ts` importable only from the 4 allowed scopes.
 */

// 2. text-accent: also catches variants (`hover:text-accent`, `text-accent/50`) and the
// `text-accent-foreground` shadcn default, which has no token in our themes.
const TEXT_ACCENT = /(^|[^\w-])text-accent(?![\w-])|(^|[^\w-])text-accent-foreground(?![\w-])/;

const r2yPlugin = {
  rules: {
    "no-use-cache": {
      meta: {
        type: "problem",
        messages: {
          banned:
            "'use cache' is banned: user data must never be shared through a cache (plan §1). Use dynamic server components.",
        },
        schema: [],
      },
      create(context) {
        return {
          ExpressionStatement(node) {
            if (typeof node.directive === "string" && node.directive.startsWith("use cache")) {
              context.report({ node, messageId: "banned" });
            }
          },
        };
      },
    },
    // `no-restricted-imports` does not see `import("…")` / `require("…")`: same scopes, same message.
    "no-admin-dynamic-import": {
      meta: {
        type: "problem",
        messages: {
          banned:
            "lib/supabase/admin.ts (secret key) may only be imported from the 4 allowed scopes (plan §1), also dynamically.",
        },
        schema: [],
      },
      create(context) {
        const isAdmin = (value) =>
          typeof value === "string" && /(^|\/)supabase\/admin(\.ts)?$/.test(value);
        return {
          ImportExpression(node) {
            if (node.source.type === "Literal" && isAdmin(node.source.value)) {
              context.report({ node, messageId: "banned" });
            }
          },
          CallExpression(node) {
            const [arg] = node.arguments;
            if (
              node.callee.type === "Identifier" &&
              node.callee.name === "require" &&
              arg?.type === "Literal" &&
              isAdmin(arg.value)
            ) {
              context.report({ node, messageId: "banned" });
            }
          },
        };
      },
    },
    "no-text-accent": {
      meta: {
        type: "problem",
        messages: {
          banned:
            "'text-accent' is banned: the accent colour is graphic only (borders, icons, bars), never text (design §3). Use text-primary or text-foreground.",
        },
        schema: [],
      },
      create(context) {
        const check = (node, value) => {
          if (typeof value === "string" && TEXT_ACCENT.test(value)) {
            context.report({ node, messageId: "banned" });
          }
        };
        return {
          Literal(node) {
            check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.cooked ?? node.value.raw);
          },
        };
      },
    },
  },
};

// 3. Scopes allowed to import the secret-key client (plan §1 and ADR-0001).
export const ADMIN_ALLOWED_SCOPES = [
  "src/features/auth/login.ts",
  "src/features/auth/bootstrap.ts",
  "src/features/accounts/admin-ops.ts",
  "src/features/jobs/**",
  "src/app/(public)/email/**",
];

const CACHE_PATHS = [
  {
    name: "next/cache",
    importNames: ["unstable_cache", "cacheLife", "cacheTag"],
    message: "Shared caches are banned for user data (plan §1).",
  },
];

const ADMIN_PATTERN = {
  group: ["**/supabase/admin", "**/supabase/admin.ts"],
  message:
    "lib/supabase/admin.ts (secret key) may only be imported from features/auth/{login,bootstrap}.ts, features/accounts/admin-ops.ts, features/jobs/** and app/(public)/email/** (plan §1).",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    plugins: { r2y: r2yPlugin },
    rules: {
      "r2y/no-use-cache": "error",
      "r2y/no-text-accent": "error",
      "r2y/no-admin-dynamic-import": "error",
      "no-restricted-imports": ["error", { paths: CACHE_PATHS, patterns: [ADMIN_PATTERN] }],
    },
  },
  {
    // The 4 allowed scopes may import admin.ts (the cache ban still applies).
    files: ADMIN_ALLOWED_SCOPES,
    rules: {
      "r2y/no-admin-dynamic-import": "off",
      "no-restricted-imports": ["error", { paths: CACHE_PATHS }],
    },
  },
  {
    // These files talk ABOUT the banned class, they do not use it.
    files: ["eslint.config.mjs", "tests/lint-fixtures/*.ts"],
    rules: { "r2y/no-text-accent": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Deliberately-bad code used as input by tests/lint-fixtures/guards.test.ts.
    "tests/lint-fixtures/cases/**",
  ]),
]);
