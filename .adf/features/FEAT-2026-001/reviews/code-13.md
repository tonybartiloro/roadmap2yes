# FEAT-2026-001 T16 — code review, round 1

Verdict: changes requested
Scope reviewed: T16 (daily job, cron route, `/email/disattiva`, `vercel.json`, `migrate.yml`, `keepalive.yml`, `keepalive-check.ts`, `tests/integration/cron.*`), commits 2d4c1eb, 735048e, 0991e1f, ae3c8f5. Unit (65) and integration cron (36) tests pass. The SQL it relies on (`job_*`, migration 20261201300000) was read for the guarantees.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-1 | should | `scripts/keepalive-check.ts:82-94`, `evaluateHeartbeat` | The production check reads only the newest `daily_job` heartbeat. The job runs daily and the check weekly, so a failed run (`ok:false`) or an over-quota run on Tue-Sat is overwritten by the next heartbeat and never seen. Vercel Hobby does not notify on a cron 500. | The alerting promised by AC44/AC53 ("quota exceeded or failure turns the run red") works only if the failure happens in the last 24 h before Monday. A week of skipped emails would go unnoticed. | Read the heartbeats of the last 8 days (`gte ran_at`). Fail on any `ok:false` or `over_quota:true`, and keep the 36 h age rule on the newest. Add a test with an old failed row followed by a healthy one. | | ❌ |
| REV-2 | should | `.github/workflows/migrate.yml:36-40` | `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are job-level `env`, so they are visible to `npm ci` (dependency lifecycle scripts) and `setup-node`. | Least privilege: the DB password of production should reach only the steps that use it (`link`, `db push`). A compromised dev dependency running `postinstall` could read it. Same for keepalive (`SUPABASE_SECRET_KEY` visible to `npm ci`). | Move the secrets to step-level `env` on `link`, `db push --dry-run`, `db push` (keepalive: only on the `keepalive:check` step). | | ❌ |
| REV-3 | should | `migrate.yml:21,35`, `keepalive.yml:17,31,49` | `workflow_dispatch` can be started from any branch and receives the environment secrets (staging; `production-keepalive` holds the PRODUCTION secret key and has no reviewers). Nothing in the repo or the plan states that these environments must restrict deployment branches to `main`. | A branch with an edited workflow could print or send the production secret key, so the "no reviewers" deviation is only safe with a branch policy. This is configuration outside the diff, so it must be written down and checked. | Add to the release checklist (plan §release / `ambienti-e-rilascio.md` for T18): environments `production`, `production-keepalive`, `staging` have deployment branches = `main` only (staging too, or accept explicitly). Optionally add `if: github.ref == 'refs/heads/main'` to the jobs. | | ❌ |
| REV-4 | note | `supabase-job-db.ts:107-120`, migration `job_sent_item_keys` | The planner reads `notification_log` directly while `job_sent_item_keys` exists, is granted and is unused. | Two implementations of "already-sent keys" can drift. The direct read has an implicit 1000-row cap (safe at 2 users x 14 days). Deviation 3 is accepted. | Either call the function or drop it in a later migration. Not blocking. | | ❌ |
| REV-5 | note | `migrate.yml:14-19` | Migration on push to main runs in parallel with the Vercel deploy, so the new code can briefly run before the migration. | The additive-only rule (plan §12) covers it, and the dry-run step is good. | State "migrations must be backward compatible with the previous code" in the runbook. | | ❌ |
| REV-6 | note | `run-daily-job.ts:241`, `digest.ts:82` | A Monday digest that is empty is not claimed, so a Tuesday/Wednesday run with new content sends it. It is still at most one per ISO week, and consistent with "nothing to report: no write". | The behaviour matches D41, but a user may receive the "Monday" digest on Wednesday. | Acceptable; mention in the runbook if desired. | | ❌ |

## Declared deviations
1. `migrate.yml` without a PR trigger: accepted. It is safer in a public repo, `permissions: contents: read`, actions pinned by SHA, separate concurrency groups per target with `cancel-in-progress: false`, never `--include-seed` or reset (REV-8 of code-6 satisfied in the file). Closes the T2 routing.
2. `keepalive.yml` with its own environment: accepted, subject to REV-3 (branch policy).
3. Direct `notification_log` read: accepted (REV-4).
4. D44 via `memberships.created_at` in Rome time: accepted. Correct for B (membership created at first login) and consistent for A. Tested ("never logged in / no catch-up").
5. Per-task switch excluded from the digest: accepted per coordinator.
6. A missed "oggi" is not recovered: accepted. It appears in the digest as "da recuperare".
7. Heartbeat in `finally`, even on failure: accepted and correct. It records `ok:false` plus the error class; the route still returns 500 (`runDailyJob` rethrows and the route maps it). See REV-1 for how the failure is surfaced.
8. Over-quota flagged, not failed: accepted, but only visible if REV-1 is fixed.
9. Extra test file (`cron.claims.test.ts`): accepted. It covers exact caps and the single claim under parallel callers (the code-7 concurrency item), so the routing is closed.

## Security summary
Verified correct:
- Cron auth: both sides SHA-256 hashed, then `timingSafeEqual` (no length leak). A missing secret or header means 401, with an operator log that carries no value. The 401 body is empty and `no-store`. The 500 body is `{ok:false}` or counters only.
- Admin client: imported only by `features/jobs/admin-job-db.ts` and `app/(public)/email/**`, matching the ESLint scope. The cron route imports the `createAdminJobDb` factory.
- Unsubscribe: GET is read-only. POST changes only the kind carried by the token. The HMAC covers context, kind and user, is constant-time and has a 512-character cap. There is no CSRF exposure: the token is the credential, which is the RFC 8058 model. Bad, other-kind and no-wedding tokens all get the same neutral 400. Headers are `no-referrer`, `no-store`, `noindex` (plus the proxy for `/email`). The query is never logged. HTML is escaped (`escapeHtml` on every dynamic part; the form action is built with `URLSearchParams`). No script.
- Email off: `emailOn` false skips `recipients`, `claim` and `send`; the integration test asserts there are no ledger rows. `job_claim_notification` itself also checks the preference and the membership.
- Delivery: deterministic `batch_key` (also the Idempotency-Key). A global advisory lock plus the claim, resume (15 min) and attempt cap give caps that are exact under concurrency (tests). Error text is a class and code only.
- Clock: the test cookie needs `E2E_CLOCK=1` and no `VERCEL`.
- `vercel.json`: one daily cron, region `fra1`, within Hobby. `maxDuration` 60 is within the Hobby limit.
- Workflows: no `pull_request` or `pull_request_target`, `permissions: contents: read`, SHAs match `ci.yml`, the DB password is never echoed.

## AC coverage
AC43 ✅ (`migrate.yml`; additive-only and no seed) · AC44 ✅ with REV-1 (job, heartbeat, 401, 500, keepalive; the check misses failures older than the last run) · AC50 ✅ (`plan.test`, `cron.job`) · AC51 ✅ (ISO W53/W01, Mon-Wed catch-up, once per week) · AC52 ✅ (`cron.unsubscribe`, opt-out has no claim) · AC53 ✅ (resume, same key, caps, flag; concurrency tests) · AC59 ✅ (email off: no claim, heartbeat yes) · AC61 ✅ (per-task switch in the plan and digest) · D41/D44 ✅.

## Questions for the developer
1. Is the keepalive production check meant to catch failures across the whole week (REV-1), or only the last run?
2. Can you confirm the GitHub environments will carry a `main`-only deployment branch policy (REV-3)? It is not recorded anywhere I could find.
