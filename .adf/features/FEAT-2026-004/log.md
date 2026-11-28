# FEAT-2026-004 — decision log

<!-- One section per phase transition, checkpoint or discussion round: who decided what, and why, in a few lines. Details stay in reviews/ and in the commits. Length target: method → Keep files short. -->

## F0 intake — 2026-11-26
- Request: roadmap R-04 "Conferme di presenza (RSVP) con link personale" (`.adf/roadmap.md → Details → R-04`), roadmap approved 2026-11-25.
- Size: L — public page without login that reads and writes third-party personal data, abuse protection, additive migration; same size as in the roadmap. Confirmed by the developer.
- Team: product-owner, architect, designer, developer(s), qa-engineer, reviewer (+ security round), technical-writer, release-manager.
- Housekeeping: FEAT-2026-003 closed (PR #5 merged, production 2026-11-26), R-03 done (ff24f30).
- Code findings for the team:
  - `src/features/invitations/token.ts`: partner-invite tokens = 32 random bytes base64url, DB stores only sha256 (`\x…` bytea). Reusable pattern.
  - `/invito/[token]` is taken by the partner invite (`src/app/(public)/invito/[token]/page.tsx`): RSVP needs its own path.
  - `src/features/auth/guards.ts:46` `PUBLIC_PREFIXES` (+ `isPlainPath`) and `src/proxy.ts:26` `NO_REFERRER_PREFIXES` must include the new public path; proxy sets `Cache-Control: private, no-store`.
  - Abuse: login limiter `private.login_attempts` (core migration ~253, ~1242-1340) with HMAC keys in `src/features/auth/limiter-keys.ts` (email/IP) — reusable for RSVP.
  - `src/app/robots.ts` already disallows everything (+ `X-Robots-Tag`).
  - `public.guests` (`supabase/migrations/20261202100000_guests.sql:73`): no RSVP fields; groups `guest_groups`; categories adult/child/infant; notes ≤500 (allergies today). ADR-0002 governs guest personal data (audit log, purge).
  - Email off until Resend is active: links shared by hand (copy / WhatsApp).

## F1 round 1 — 2026-11-26
- PO brief: 19 AC, 3 steps, 8 questions. Architect ARC-1..10 (`reviews/f1-architect.md`; blocking ARC-3 token in Vercel request logs, ARC-4 link created on first use breaks iOS share; Q8 → derived token HMAC(`RSVP_LINK_SECRET`, id), ADR-0003; ARC-8 split). Designer DES-1..23 (`design.md` draft; blocking DES-1 theme/RsvpShell, DES-2 where share actions live).
- PO response: 30 accepted, 1 in part (DES-17: per-IP limit only on invalid links, 429 instead of the neutral page when blocked), 2 rejected (ARC-7 simple bulk No without undo → DES-7 undo restores preferences; DES-21 "last 7 days" → follow-up). Brief now 21 AC: step 1 AC1-14 (shippable core), step 2 AC15-21 (couple tools). Open questions D1-D13 in `brief.md → Decisions`.
- design.md is 26 KB (target 25 KB for L): the designer condenses it when finalising in F2.

## F1 decisions and Gate A — 2026-11-26
- Developer: "Accetto tutte" → D1-D13 accepted as proposed (`brief.md → Decisions`).
- D1 split: FEAT-2026-004 = step 1 only (AC1-AC14); old AC15-AC21 → new roadmap item R-07 (M, depends on R-04). Roadmap re-approved 2026-11-26 (`adf roadmap approve`).
- Answer deadline moved to R-07; here guests can answer until the link expires (BR7). New secret `RSVP_LINK_SECRET` (D4) and ADR-0003 (D3, D5) go into the plan.
- Gate A recorded via roadmap R-04.

## F2 round 1 — 2026-11-26
- Architect plan: 13 tasks in 5 steps (S1 data, S2 server, S3 public page, S4 couple side, S5 tests/docs/release), 2 additive migrations, no new dependency, ADR-0003 drafted (proposed); `public-rpc.ts` = fifth secret-key scope; `undo_guest_import` replaced to keep people who answered.
- Challenge: QA-1..17 (`reviews/f2-qa.md`; blocking QA-1 clock, QA-2 limiter isolation, QA-3 closed lifecycle matrix, QA-4 normalized neutral comparison), DES-24..36 (`reviews/f2-designer.md`, 0 blocking; design.md finalised, 16 KB), PO-1..7 (`reviews/f2-po.md`, 0 blocking; PO corrected D4 wording in brief).
- Architect accepted all 37 (QA-15 refined). Technical decisions P1-P7 in `plan.md → Decisions`. AC amendments AC3, AC6, AC10, AC12 to approve at Gate B. plan.md 39 KB (target 40 KB).

## Gate B — 2026-11-26
- Developer: "Approvo" → plan, AC3/AC6/AC10/AC12 amendments, ADR-0003 (accepted), `public-rpc.ts` as fifth secret-key scope, P5/P6, D4 correction, routine git work (commits, push of the branch — public repo, PR, fix commits). Merge to main = production → Gate C. No new dependency.
- Developer must create `RSVP_LINK_SECRET` in Vercel (Production + Preview, different values, Sensitive) before the merge.

## F3 S1 progress — 2026-11-26
- T1 (6e6aa08, af95a06): migration + couple RPCs, pgTAP model/RLS/lifecycle matrix; ownership extended to `qa_cross_wedding.test.sql` and `tests/acceptance/support/matrix.ts` (plan Change log). db:test 1623 green.
- T3 (3cd7bc1): `supabase/seeds/05_rsvp.sql` reuses the 04 demo wedding; fake local secret `local-fake-rsvp-secret-0123456789abcdef`, link id `00000000-0000-4000-8000-0000000a3001` → token `D-nIsgqL5dGbgoSIb9_oamFr3fXgA_dVLTkmc1J0vno` (T4 test vector; T11 must not use it).
- T2 (a147c0f): `rsvp_attempts` + `rsvp_gate/page/submit` (service_role only), 140 pgTAP; db:test 1763 green. Deviations: `answered_at` in each person (for `seen_at`), malformed IP key = `invalid_key`, empty answers = `invalid_answers`. Signatures/codes for T5 in the T2 commit and `rsvp_public.test.sql`.
- S1 review: code-1 (general) and code-2 (security round, L) on `c96b987..HEAD`.

## F3 step S1 checkpoint — 2026-11-26
- Reviews: code-1 REV-1..10 (2 should: limiter race, NUL case) → fixed/closed, approved; code-2 security APPROVED, nits REV-101..106 answered (101-103 fixed, 104/106 residuals for `sicurezza.md`, 105 note for S2). Fix commit 9c4b354.
- Coordinator decisions: Q1 blank note → null in the T7 server action (DB rejects); Q2 create/rotate refuse after expiry (`link_expired`); Q3 explicit revoke = "Da rimandare" (D8); REV-2 NUL covered in T5/T10 (plan Change log).
- `test:integration` found missing acceptance fixtures for the 3 tables and a real bug (service role could not insert into `rsvp_responses`: CHECK function without EXECUTE) → fixed in f81708a (grant to service_role only).
- Carry-overs: T5 maps non-`invalid_answers` errors to a generic state and passes `p_ip_key: null` explicitly; T7 sends blank note as null and `answered_at` untouched as `seen_at`; S2/S3 list columns on `rsvp_links` (never `select('*')`); T10 adds the `\u0000` PostgREST case.
- Tests: db:test 1778 green (26 files); test:integration 894 pass + 1 skipped; `adf verify` pass on 828f4a350dc1 (lint, typecheck, unit, build).
- Developer: "Procedi con S2".

## F3 step S2 checkpoint — 2026-11-27
- Done: T4 token/config (5f1fc5b), T5 public edge: `public-rpc.ts` (fifth secret-key scope), limiter keys, proxy gate/429/theme header, `/rsvp` public + no-referrer (93f3976), T6 couple data/actions/view/export (4afbc13) + new RPC `rsvp_link_matches` for the "va rigenerato" check (60156f2). Extra files approved by the coordinator: export domain files, `rsvp_rls.test.sql` (plan Change log).
- Reviews: code-3 (general) REV-11..18 → fixed/closed, approved; code-4 (security) REV-111..115 → 111 decode-then-shape-check, 112 gate only GET/HEAD, 113 fake secret refused on any `VERCEL_ENV`; 114/115 residuals for `sicurezza.md` (T12). Fixes c42a4d0, 6e4582f.
- Tests: unit 1434, integration 908 (+1 pre-existing skip), db:test green; `adf verify` pass on b27cdfc01b20; built app curl on `/rsvp/<seed token>` → 404 with noindex, no-store, no-referrer (page = T7).
- Carry-overs for S3/S4: T7 shape-checks `params.token` with `isRsvpTokenShape`, sends blank note as null and `answered_at` untouched as `seen_at`, uses `rsvpLoadPage`/`rsvpSubmit` from `public-rpc.ts`; T8 imports client constants from `src/features/rsvp/constants.ts`; T9 may make `GroupView.rsvpMode` required.
- Developer: resumed with `/adf:resume` (new session) → S3.

## F3 step S3 progress — 2026-11-27
- T7 (eae198c): public page, `submitRsvp`, components; declared deviations accepted (plan Change log).
- Blank 404 without JS (`notFound()` in Next 16.4.6 renders via a client boundary) → architect arbitration: proxy serves the neutral 404 from `neutral-html.ts`; page renders `LinkUnavailable` in 200 only on fail-open (`plan.md → Decisions → Arbitrato S3`).
- Reviews: code-5 REV-19..23 and code-6 REV-116..122 → fixed in 25c677f, both approved round 2. Residuals for `sicurezza.md` (T12): REV-114/115, D5 token in logs/history, preview crawlers, CSP `unsafe-inline`, guest uuid as opaque id, unlimited invalid payloads, fail-open 200/9 s/double count (REV-122), token in own Flight payload.
- `adf verify` pass (lint, typecheck, unit, build). Designer design-1: DES-37 **blocking** — no-JS submit fails in Chromium: `Referrer-Policy: no-referrer` → `Origin: null` → Next rejects the server action (500). Fix `same-origin` conflicts with AC10 and ADR-0003 → question for the developer. DES-38/39 should (320 px legend gap, Sì/No wrapping); notes DES-40..44. design.md updated for the deviations.
- Developer: "Sì, same-origin" → brief D15, AC10 updated; ADR-0003 line to update in T12.

## F3 step S3 checkpoint — 2026-11-27
- Fix 048bcbc: `same-origin` on pages that reach `/rsvp/[token]` (header + meta), neutral 404/429 keep `no-referrer`; DES-38/39/43 fixed, DES-40 partly. No-JS submit verified in headless Chromium at 320 px.
- Reviews closed: code-5 approved (round 2), code-6 approved (round 3, residual 10 = own-origin Referer), design-1 approved on 048bcbc (notes DES-40/41/44 open, no action).
- Carry-overs: T10 checks the neutral 404 body = `neutralHtml()`, one BR9 failure per dead open, `Referrer-Policy` per page type (dead-link 404 branch has no test yet); T11 submits for real without JS, checks no-JS dead link and revoked-link submit; T12: `sicurezza.md` residuals (10, list in `reviews/code-6.md`), ADR-0003 referrer line, stale comment `next.config.ts:43`, `servizio-in-pausa.md` "dal pannello".

## F3 step S4 checkpoint — 2026-11-28
- Resumed with `/adf:resume` (new session). plan.md condensed 41 → 37 KB by the architect (671a16b).
- T8 (a0400e5): `LinkSheet`, `GroupModeDialog`. T9 (aed2ce6): presence, group summary, link state + "Invia", `CreateAllDialog`, "Come rispondono", read-only presence, "K restano" toast. Coordinator approved `GuestList.tsx` + `CreateAllDialog.tsx` for T9; `dateChosen` = date only (no location signal); T8 deviations in plan Change log.
- Reviews: code-7 REV-24..37 (6 should) → fixed, approved round 2 (+ notes 36/37 fixed in round 3); code-8 security REV-123 should (stale URL after rotate) → fixed, approved; design-2 DES-45 **blocking** (toast Annulla unreachable under the modal sheet, tap fell through to WhatsApp) → inline Annulla in the sheet; DES-59 blocking (lost dialog name) and DES-60 found in round 2 → fixed, approved round 3 (axe 0 at 320/1280). Fixes 069f9fc, f55e76f.
- Coordinator decisions: REV-124 diet data stays in the list payload (same access as RLS) → residual; REV-29 degrade + fixed-code log, no on-page notice; REV-31 `hasGuestsPermission` refactor out of scope.
- Carry-overs: T11 keeps the `<script>` note case (REV-127) and the singular "1 link personale" copy; T12 `sicurezza.md` residuals REV-124/125/126 and `getLinkUrlAction` without rate limit/audit; follow-up DES-54 (24 px toast Annulla in shared `ui/sonner.tsx`, also R-03) and R-03 `ConfirmDialog` focus return.
- Tests: unit 1521/1521, typecheck, lint 0 errors; no DB change in S4. `adf verify` pass on 7d7b460 (lint, typecheck, unit, build).
- Next: S5 (T10 QA acceptance/integration, T11 e2e, T12 docs, T13 release checklist).
- Developer: "Nuova sessione" → S5 continues in a new session with `/adf:resume FEAT-2026-004`. Follow-up DES-54 + `ConfirmDialog` focus started as a separate session on its own branch.

## F3 step S5 progress — 2026-11-28
- Resumed with `/adf:resume` (new session). T10 (qa-engineer), T11 (qa-engineer) and T12 (technical-writer) started in parallel (disjoint files); T13 after T12.
- The local Supabase stack is shared with the DES-54 worktree (based on `main`, no RSVP schema): a reset there drops `rsvp_*`; briefs say to restore with `npm run db:reset` from this checkout.
- T12 (a18ca78) docs; T13 (5de6f5e) release checklist, QA-17 evidence: only `db push --remote` in `migrate.yml`, no seeds remotely. T10 (72412d6) 43 tests; QA-A (broken escape on `/rsvp` → 307 `/accesso`) fixed in `guards.ts` (34e862d); QA-B `retry_after_seconds` 901 under lock wait → to the security round. T11 (5dd715e) e2e green on Chromium (67 + `--repeat-each=2`), WebKit smoke left to CI; "sola lettura" not testable (no read-only role exists); WhatsApp greeting order with equal surnames (cosmetic).
- Repo-wide `npm run lint` fails on the DES-54 worktree under `.claude/worktrees/` (ESLint does not ignore `.claude/**`): fix with the review round.
- Writer questions: bulk revoke → follow-up (R-07); test file names in `sviluppo-locale-e-test.md` after T10/T11.
- S5 review: code-9 (general) and code-10 (security) on `95cbc6c..HEAD`.
- code-9 REV-38..46 (4 should: AC10 OG test, test docs, Guide "8 s", fixed 2027 dates in e2e); code-10 REV-128..133 (2 should: `rsvp.test.ts` skipped in CI, missing residuals REV-104/105/106). QA-A fix verified with curl; QA-B (901 s) accepted, value never shown.
- Coordinator decisions: REV-41 relative dates in non-time e2e; `ci.yml` and `eslint.config.mjs` (`.claude/**` ignore) added to T10's files; the release-manager puts the `e2e-full` label on the PR so the WebKit smoke runs before merge.
- Fixes 19091b6 (docs), 73e1a00 (e2e), 34771d5 (acceptance, `ci.yml`, ESLint ignore). code-9 and code-10 approved round 2, all items closed. Leftover note: "Limiti in locale" bullet in `sviluppo-locale-e-test.md` still says tests clean `rsvp_attempts` (F4).

## F3 integration — 2026-11-28
- `adf verify --with-e2e`: lint, typecheck, unit, build pass; e2e 339 pass / 24 fail. QA qa-1: 16 environment (WebKit missing → installed; degraded/email-off need `E2E_ALL_SERVERS=1`), pgTAP 1785 green, RSVP integration/acceptance 124 green.
- Findings: QA-20 blocking (R-03 e2e specs stale after T9), QA-21/22 should (test waits), QA-23 should (WebKit `Load failed` opening the link sheet), QA-24 note (verify e2e command → project memory, needs the developer's yes), QA-25 should (full `test:integration` hangs on `jobs.test.ts`).
- Coordinator: `invitati.mobile/desktop.spec.ts` added to T11's files for QA-20/21; QA-23 to a developer (port 3302); QA-25 after, on a fresh `db:reset`.
- QA-23: not an app bug — `goto("/invitati")` cancels the pending login action and WebKit logs `Load failed`; listeners now start after login. 05af182 fixes QA-20/21/22/23 in the tests (WebKit 15/15, `rsvp.invitati` 72/72 at 4 workers).
- QA-20 exposed a real regression of R-03 DES-03: at 768 px the flat list (6 columns with presence) makes a long-name row 113 px high (limit 80) → developer fix in `GuestRow`; test limits unchanged.
- cb33812: tighter name leading, 0.5 rem gap, narrower Type track, 64 px "Invia" at md+ → row 77 px; 34/34 e2e. design-3 APPROVED (32 combinations, axe 0); notes DES-61 (rule ≤ 80 px without link line, ≤ 100 px with one, in design.md §1.2), DES-62 optional padding, DES-63 long group/table names break mid-word at 768 px (pre-existing R-03, follow-up).
- QA-25 (full `test:integration` hang) next, on a fresh `db:reset`.
