# Code review 1 - T1 Scaffolding + CI (FEAT-2026-001)

Verdict: **approved with changes (no blocking)**. Counts: blocking 0, should 5, nit 6.
AC coverage: AC1 (scaffolding, scripts, lint guards) ok; AC43 (closed signup, code policy, headers) ok, with S4 to verify; AC45 (gitleaks, @example.test guard) ok, with S1.
Accepted deviations (ports 544xx, separate Mailpit, classifyDbError, extra guards, guards.ts placeholder, plugin-react, TS 5.9.3) checked: correct and safe.

## Should

S1. `.gitleaks.toml:9-11` - the allowlist skips the WHOLE `.env.example` (path allowlist), while the header says "every finding must be fixed, not allowlisted". A real key pasted into the example file (the likeliest leak spot) would never be flagged. Fix: drop the allowlist (the placeholders `sb_*_REPLACE_*`, `local-*` do not match default rules; verify with a local gitleaks run), or narrow it to `regexes` for the exact fake values.

S2. `.gitignore:1-3` - only `.env` and `.env*.local` are ignored. `.env.production`, `.env.development`, `.env.staging` would be committed by `git add .`. Fix: `.env*` plus `!.env.example`.

S3. `src/lib/app-config.ts:readSiteUrl` - without `NEXT_PUBLIC_SITE_URL` it silently falls back to `http://localhost:3000` (or `VERCEL_BRANCH_URL`, which is a preview alias even in production). In production this means invitation/recovery emails with localhost links and no error. Fix: in production (`VERCEL_ENV=production` / `NODE_ENV=production`) with no site URL, throw (or use `VERCEL_PROJECT_PRODUCTION_URL`); keep localhost only for dev/test. Add a test.

S4. `supabase/config.toml:63` - signup is closed only at the top-level `[auth] enable_signup`. Newer CLI also has `[auth.email] enable_signup` (email provider). Closing both is cheap defence in depth, and nothing yet proves AC43 against the real server. Fix: set `enable_signup = false` in `[auth.email]` too (if the pinned CLI 3.3.0 knows the key) and add, in T2/T7, an integration test: `POST /auth/v1/signup` returns 422/`signup_disabled`, and a 9-char / letters-only code is rejected by Auth. Question for dev: was `supabase start` run with this config and did it start cleanly (key names `local_smtp`, `password_requirements`)?

S5. `.github/workflows/ci.yml` (e2e jobs, `--pass-with-no-tests`; `package.json` `test:integration --passWithNoTests`, `e2e`) - green with zero tests hides a wrong glob or a renamed project. Acceptable for T1 only because no specs exist yet. Fix: leave a tracked item (plan/risk) for T2/T17 to remove both flags when the first spec lands; same for the `hashFiles(...)` skipped steps (pgTAP, db:types, gen:themes, check:fonts): they must stop being optional once their owner task merges.

## Nit

N1. `ci.yml` "Save Supabase Docker images" - if the `grep` matches nothing, `xargs docker save` fails the job after green tests; also never runs when tests fail, so the cache is only warmed on success. Fix: `xargs -r`, and `if: always() && steps.images.outputs.cache-hit != 'true'` with `continue-on-error: true`.

N2. `ci.yml` - the gitleaks image (`v8.30.1`) and Mailpit (`package.json` `mail:start`, `v1.31.3`) are pinned by tag, not digest. Actions are pinned by SHA; same standard for images would be consistent (Dependabot can bump).

N3. `eslint.config.mjs` ADMIN_PATTERN `**/supabase/admin` does not match a sibling `./admin` import from inside `src/lib/supabase/`, nor `admin.js`. Add `./admin` and `**/supabase/admin.js` patterns plus fixtures. Question: integration tests (T2/T17) will need a service client; they are not in the 4 scopes and will fail lint. Decide now (add `tests/integration/**` as a documented 5th scope, or build the client with `supabase-js` directly in the test helper) to avoid an ad-hoc allowlist later.

N4. `next.config.ts` CSP - `connect-src` uses the Supabase origin read at build time, while the proxy reads it at runtime; a runtime override (degraded e2e server) leaves CSP stale. Harmless today; add a comment. Also consider `upgrade-insecure-requests` in production.

N5. `src/components/ui/button.tsx:14` - `destructive` uses hard-coded `text-white` instead of a token (`text-destructive-foreground`); the theme generator (T3) should expose that token. Check the other `ui/*` files for hard-coded colours before T3 builds on them.

N6. `src/proxy.ts` matcher excludes any path ending in an image/font extension, including `/api/foo.png` (would skip the guard). No such route exists; either restrict the exclusion to non-`/api` paths or note it for T7a, and add a guard test in `guards.ts` for dot-segment/encoded paths (`/accesso/%2e%2e/x`).

## Checked and fine (security focus)
- No secrets, real emails or `.env` tracked (`git ls-files | grep env` gives only `.env.example`; values are `@example.test` / fake). `check-test-emails` never prints the address.
- `admin.ts`: `server-only`, lint guard with alias, relative, dynamic, require and re-export fixtures; secret read via `readSupabaseSecretKey` at runtime; error messages value-free; no `console.*` in `src`.
- Clock: cookie honoured only with `E2E_CLOCK=1` and `VERCEL` undefined; unparsable value ignored; `getNow` imports `next/headers` lazily.
- Proxy fails closed (exception -> claims null -> login redirect; missing config throws -> 500, never open); `Cache-Control: private, no-store` and Referrer-Policy on every decision type; `/api/cron/` bypass relies on handler-level `CRON_SECRET` (T14 must enforce).
- Headers: CSP with `frame-ancestors 'none'`, `object-src 'none'`, no `unsafe-eval` in production; HSTS, nosniff, DENY, Permissions-Policy, noindex, `poweredByHeader: false`.
- CI: workflow `permissions: contents: read`, no secrets referenced, fork PRs get none, actions pinned by SHA, concurrency sane, only fake values, artifacts only on failure with 7-day retention. Guarded steps are limited to files owned by later tasks (see S5).
- `config.toml`: only `public` exposed, code policy 10 + `letters_digits`, confirmations off, anonymous off, unused services off, high rate limits clearly commented as local-only.
- Contracts: npm scripts (`db:*`, `test`, `test:tz`, `test:integration`, `e2e`, `bootstrap`, `gen:themes`, `check:fonts`, `keepalive:check`), Playwright project names (`mobile`, `desktop`, `webkit-smoke`, `time`, `degraded`, `email-off`) and filename convention, `guards.ts` types/signature, clock API (`TEST_NOW_COOKIE`, `isTestClockAllowed`, `resolveNow`, `getNow`) are coherent with plan §1.1/§12.
