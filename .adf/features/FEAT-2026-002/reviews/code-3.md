# FEAT-2026-002 — code review, round 3

Verdict: changes requested (1 should, 2 notes; no blocking)
Scope reviewed: F3/S2 T7, T8, commits 4d26199 and cb2ffc3

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-8 | should | `README.md:26` | "Home, Altro, promemoria email" still names the old section in the docs entry point (the functional docs index now says Opzioni). | A user-visible name left behind; AC7 asks for the confirmed name everywhere the section is named. | Replace "Altro" with "Opzioni". | | ❌ |
| REV-9 | should | `docs/technical/ambienti-e-rilascio.md:90,201,266,284`, `docs/technical/sicurezza.md:207` | Operator docs still say "Altro > Account", "Altro > Info", "Altro > Promemoria" (5 places). Not in the Guida (only `docs/functional`), but they describe UI paths that no longer exist by that name. | Operator following the runbook looks for a menu entry that is now called Opzioni. | Rename to "Opzioni > ..." (docs only, no code). | | ❌ |
| REV-10 | note | `src/app/(app)/altro/*/loading.tsx`, `aspetto|promemoria|info|account|esporta/page.tsx`, `features/*/actions.ts`, `invitations/*`, `unsubscribe-token.ts:14`, `onboarding/actions.ts:132`, `e2e/*.spec.ts` (titles) | "Altro >" remains in code comments and test titles outside T7's files. Not user-visible. | Drift of vocabulary only. | Accept, or sweep in a later chore. | | ❌ |

## Checks done
- User-visible strings in `src`: no "Altro" left in UI, login, onboarding, reminder email (html and text, same `change` string), unsubscribe pages (4 pages), nav, page title and h1. Template test updated and consistent.
- Intentionally unchanged and correct: `PersonForm.tsx:39` "Altro: scrivi tu", `budget/model.ts:44`, `style-tips.ts:60` + its test (`onboarding.test.ts:186`), `components.test.tsx:870` (fixture), "un altro/altra" in Italian prose.
- Route `/altro` and all `/altro/*` hrefs, revalidatePath, guards, proxy and e2e URLs untouched; "Impostazioni nozze" unchanged. Nav: `Settings` icon replaces `Menu`, constant shared by nav, page and test.
- Docs: `altro.md` renamed to `opzioni.md` (git rename, 94% similarity); the only link to it (`README.md` index) updated; no other reference to `altro.md` found. "Opzioni > X" consistent in all functional docs; panoramica adds Guida.
- Email text escaped as before (`>` is `&gt;` in HTML pages; unchanged pattern).

## AC coverage
AC7: name and internal links ✅; "Impostazioni nozze" kept (does not duplicate "Opzioni") ✅; 320 px fit of 6 labels not verifiable here (T10 e2e). Residual "Altro" in README/technical docs: REV-8, REV-9.

## Questions for the developer
None.

## Response (coordinator, 2026-11-25)
- REV-8, REV-9: deferred, not rejected — both are already in `plan.md → Documentation plan` for F4 (root `README.md:26`; `ambienti-e-rilascio.md:90,201,266,284`, `sicurezza.md:207`). The technical writer fixes them in F4; checked again before the PR.
- REV-10: accepted as is (comments and test titles, not user-visible).
- Verdict after response: approved for S2 code.
