import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolveFromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Two projects (plan §12):
 * - `unit`: pure code, lint-fixture tests, no network or database. Run by `npm test` and by the
 *   `checks` CI job (also with TZ=UTC and TZ=America/Los_Angeles via `npm run test:tz`).
 * - `integration`: tests/integration + tests/acceptance, need the local Supabase stack
 *   (`npm run db:start`). Run by `npm run test:integration` and the `db` CI job.
 *   Files run one at a time because they read/write global state (rate limits, heartbeats).
 */
const shared = {
  resolve: {
    alias: {
      "@": resolveFromRoot("./src"),
      // `server-only` throws outside the React Server condition; neutralise it for Vitest.
      "server-only": resolveFromRoot("./node_modules/server-only/empty.js"),
    },
  },
  oxc: { jsx: { runtime: "automatic" as const } },
};

export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.{ts,tsx}",
            "scripts/**/*.test.ts",
            "tests/unit/**/*.test.{ts,tsx}",
            "tests/lint-fixtures/**/*.test.ts",
          ],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts", "tests/acceptance/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
