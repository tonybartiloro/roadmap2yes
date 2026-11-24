# QA run 1 — FEAT-2026-001 (T17a–d, e2e + acceptance)

Date: 2026-11-24. Runner: adf:qa (summary recorded by the coordinator from the QA report).

## Scope and results
- **Specs per project:** mobile 98, desktop 98, time 3, email-off 5, degraded 7, webkit-smoke 3. WebKit is not installed locally, so webkit-smoke ran on Chrome with the iPhone 13 viewport.
- **mobile + desktop + time + email-off**, run twice: 376 passed, 18 failed, 2 skipped. 16 of the failures are deliberate defect tests (below); the other 2 were flaky helper issues and are now fixed.
- **degraded:** 5 passed, 2 failed (QA-7, QA-8).
- **New acceptance tests** (login-neutral, bootstrap, timeline, jobs, unsubscribe, email-off): pass. One unidentified one-off failure did not reproduce in 3 reruns.
- **axe:** clean on 15 screens. With `E2E_AXE_MATRIX=1` it is also clean on all 12 themes, light and dark. One best-practice note: `heading-order` on `/scelte/location`.

## Defects
| ID | Sev | Spec / AC | Expected | Actual | Owner | Status |
|---|---|---|---|---|---|---|
| QA-1 | high | partner.spec / AC5, AC7 | "Sì, revoca" revokes the invite and deletes the account | Dialog closes, no POST; invite stays active (submit button unmounted before submit) | T7b | fixed |
| QA-2 | high | onboarding.spec / AC14 | "Ecco il tuo percorso" summary stays until "Vai alla home" | Shown ~40 ms, then redirect to Home; B's code reminder and invite link lost | T10 | fixed (cc3cd1e) |
| QA-7 | high | degraded.spec / AC39 | Outage page < 10 s (Vercel Hobby limit) | ~52 s when backend refuses connections (session refresh retries in proxy) | T7a (proxy/guards) | fixed (623e8ff) |
| QA-8 | medium | degraded.spec / AC39 | "Riprova" on paused page → "È ancora in pausa." | Lands on login (proxy drops cookies on failed refresh) | T7a | fixed (623e8ff) |
| QA-5 | medium | scelte.spec / AC17 @360 px | Only the compare table scrolls | Page scrolls sideways (389 vs 360) | T12 | fixed (68a293e) |
| QA-6 | low | a11y.spec / WCAG 2.4.3 | Escape on task sheet returns focus to the task title | Focus on `body` | T11 | fixed (05aee10) |
| QA-3 | low | percorso.spec / copy | Filter label with nameless partner reads naturally | "Di il tuo partner" | T11 | fixed (05aee10) |
| QA-4 | open | percorso.spec | Task title clickable after add/edit/complete/reopen on mobile | "not stable" on mobile; desktop passes | T11 | fixed (05aee10) |

## Final integrated run (after fixes and the design pass) — 2026-11-24
- `adf verify`: pass. HEAD commit is verified content.
- `db:test`: 956 tests across 19 files, pass. `test:integration`: 742 passed, 1 skipped.
- e2e (mobile, desktop, time, email-off, degraded): 209 passed, 1 skipped, and 1 cold-start failure in the axe harness self-test. That test is now deterministic: 10/10 passes, plus a pass as the first test of a fresh run.
- Additional defects fixed during the run:
  - `/budget` sideways scroll at 320 px (145da2b);
  - `notifications_job` pgTAP depending on ledger state (fd25a38);
  - the `home.time` spec updated to the DES-34 copy (0c002af).

## AC gaps
- **Manual or later:** AC9 (Resend, manual after the domain exists).
- **Not tested end-to-end:** AC23 (genericity is architectural), AC25 (rite-specific tasks; only suggestions are covered, so QA must add this), AC7 (link opened by an account with a different email).
- **Removed:** AC8.
- **Covered by CI rather than re-tested here:** AC11, AC43, AC45.

## CI
`headers.test.ts` never runs in CI: it needs `.next/BUILD_ID`. Fix: in the `e2e-mobile` and `e2e-full` jobs, after `npm run build`, run `npx vitest run --project integration tests/acceptance/headers.test.ts`. This touches `ci.yml`, which is owned by T1 (closed), so the coordinator routes it.

## Not testable locally
Real WebKit/Safari, VoiceOver, real devices (covered by `qa-a11y-checklist.md`); Resend delivery; Auth settings on staging and production.
