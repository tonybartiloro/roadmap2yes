# FEAT-2026-004 — code review (general round), S2 Server (T4, T5, T6 + `rsvp_link_matches`)

Verdict: **approved** after round 2 (REV-11..18 closed; Q1 closed with one step left for the coordinator, see below). Round 1 was "changes requested" (0 blocking, 2 should, 6 nits); nothing was a security hole.
Scope reviewed: round 1 `git diff f432083..HEAD -- src supabase tests eslint.config.mjs vitest.config.ts .env.example .github` (5f1fc5b T4, 93f3976 T5, 4afbc13 + 60156f2 T6); round 2 `git diff 61ef4bb..HEAD -- src supabase tests` (c42a4d0 proxy, 6e4582f couple side). Read-only checks, round 2: `npm run test` (105 files, 1434 tests), `npm run typecheck`, `npm run test:integration -- tests/integration/rsvp.actions.test.ts` (11/11), all green. The security round runs separately. Numbering continues from REV-10.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-11 | should | `src/proxy.ts:175-199` | The gate answered 429 on **every method**; the plan says GET (P3, Q-P2). The `submitRsvp` POST from a locked IP with a dead token got HTML 429 instead of the neutral view (AC6). | Plan deviation; AC6/QA-4 need the submit path identical. | Gate only for `GET`/`HEAD`; test POST + `blocked: true`. | Fixed (c42a4d0): `isPageLoad` (GET/HEAD) guards the gate and the theme header; POST test added. Also decodes the path token once, like the page (security REV-111). | Closed: verified in `src/proxy.ts` and `src/proxy.test.ts` |
| REV-12 | should | `src/features/guests/data.ts:187-196` | The 42703 fallback of `loadGuests` had no test. | A regression blanks Invitati in every deploy window. | Unit test with a fake `Db`. | Fixed: `src/features/guests/data.fallback.test.ts` (42703 retries with legacy columns, `rsvpMode: "together"`; column present is read; other codes still fail). | Closed |
| REV-13 | nit | `src/proxy.test.ts:331-336` | Title promised "guards do not let through" but only the outage was covered. | Name promised more than the test checked. | Add redirect/deny. | Fixed: redirect, deny and non-outage rewrite decisions added, gate never called. | Closed |
| REV-14 | nit | `src/features/rsvp/data.ts:116-125` | Client-needed constants lived in a module importing `node:crypto`. | T8 could drag Node code into the browser bundle. | Move to a Node-free module. | Fixed: `src/features/rsvp/constants.ts` (`STALE_MESSAGE`, `LINK_ERROR`, `SHARE_ERROR`, `RSVP_STALE_CODES`, `SharedPrevious`); `data.ts`/`actions.ts` import it. T8 must import from `constants.ts`, never `data.ts`. | Closed |
| REV-15 | nit | `src/features/rsvp/view.ts:182-185` | "link nessun link" for a group without a link. | Screen-reader text. | Special-case `none`. | Fixed in `view.ts`; test covers none, null, to_share, resend, expired. | Closed |
| REV-16 | nit | `src/features/rsvp/data.ts:183-215` | `getLinkUrl` made four round trips. | Latency on the one-tap flow. | Call `rsvp_link_matches` first. | Fixed: `rsvp_link_matches` first (authz, wedding scope, hash), then `revoked_at`; two calls; forbidden/stale/revoked integration cases pass. | Closed |
| REV-17 | nit | `tests/integration/rsvp.actions.test.ts` | Batching >1000, `link_expired`/`invalid_*` mapping and a non-empty Annulla snapshot were untested at data level. | AC12/AC8 proven only in SQL. | Unit and integration cases. | Fixed: `src/features/rsvp/data.test.ts` (1001 targets, error mapping, no DB message leaks) and an integration case for a non-empty snapshot. | Closed |
| REV-18 | nit | `supabase/tests/rsvp_model.test.sql:290-296` | Misplaced section comment. | Misleading header. | Move it. | Fixed. | Closed |

## Question
- Q1 (proxy imports `server-only` modules: `clock.ts`, `public-rpc.ts` → `admin.ts`): **closed on the build, one step left.** The developer reports `npm run build` green and a `curl -i` on `/rsvp/<43 chars>` answering 404 with `Referrer-Policy: no-referrer`, but the curl ran on the build before the c42a4d0/6e4582f changes. The coordinator re-runs `npm run build` + `curl -I /rsvp/<43 chars>` on the final tree; no code change expected.

## Round 2 notes
- `readRsvpLinkSecret` now refuses the fake value on **any** `VERCEL_ENV` (production and preview), stricter than the deviation I accepted in round 1. CI, e2e and local runs do not set `VERCEL_ENV`, so they keep working; `.env.example` still says "refused in Production" and could say "on Vercel". Not a finding.
- The `%41…` gate-bypass I noted in round 1 is gone: the proxy decodes the token once before the shape check.

## Checked in round 1, no finding
- **429 text vs `Retry-After`**: static "riprova tra 15 minuti" is the literal AC10/design wording; `Retry-After` is the dynamic remainder (1..900). Consistent, never shorter than the truth for the reader.
- **Gate ordering**: guards first, gate only on `next` and a healthy backend; bounded (3 s) and fail-open; malformed tokens never reach the DB (QA-15).
- **Theme header**: the client's `x-r2y-theme` is always deleted; set only from an approved id for a working link; `getActiveThemeId` gives it precedence and re-validates.
- **`resolveNow` (QA-1)**: proxy uses `resolveNow({cookieValue})`, actions use `getNow()`, `loadRsvp`/`view.ts` take `now`; no stray `new Date()` in `src/features/rsvp`.
- **`rsvp_links`**: columns always listed, no `select('*')`; `token_hash` only written by RPC or compared in `rsvp_link_matches` (DEFINER, wedding-scoped, no oracle).
- **Actions**: zod `.strict()`, session from cookies, fixed messages, no DB text, no logs, `revalidatePath` only on success; permission enforced by RPC and RLS.
- **`view.ts`**: precedence Scaduto → Condiviso/Da condividere → Da rimandare → Nessun link; Europe/Rome expiry; strings and WhatsApp text match the design.
- **Export**: only `rsvpResponses`/`rsvpLinks`, no token or hash, CSV unchanged, `not_migrated` gives empty lists.
- **Degraded schema**: `loadRsvp` null on `PGRST202/PGRST205/42P01/42883`; `undo_guest_import` without `skipped` gives 0; `loadGuests` fallback now tested.
- **Reported deviations accepted**: `as string` on `p_ip_key`, `tests/lint-fixtures/guards.test.ts`, optional `GroupView.rsvpMode`, WhatsApp helper takes `couple` names as input (T8 supplies them), `rsvp_link_matches` + pgTAP edits.

## AC coverage (server part of S2)
AC1 ✅ · AC2 ✅ (HTTP proof in T10) · AC6 ✅ (POST case fixed) · AC7 ✅ · AC8 ✅ · AC9 ✅ (UI T9) · AC10 ✅ · AC12 ✅ · AC13 ✅.

## Q1 closed by the coordinator — 2026-11-27
`adf verify` (incl. `npm run build`) pass on b27cdfc01b20 (final S2 tree). `next start -p 3300` + `curl -i /rsvp/<seed token>`: 404 (page not built yet, T7), `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store…`, `referrer-policy: no-referrer`. Server stopped.
