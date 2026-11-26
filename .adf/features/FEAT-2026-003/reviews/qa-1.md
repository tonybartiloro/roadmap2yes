# FEAT-2026-003 — qa review, round 1 (final QA run, T17)

Verdict: approved, with two items left to the developer (WebKit not run; local Supabase mail template)
Scope reviewed: whole feature (S1 people, S2 tables, S3 import/export) on branch `feature/FEAT-2026-003-invitati`, up to commit 10c623b plus the T15/T17 test commits.

How it was run: `E2E_PORT=3300 adf verify --with-e2e` (full suite, once): 288 passed, 18 failed, 1 skipped. Triage of the 18, each re-run the intended way (only the failed ones), is below. Heavy matrices: only the themes pass of the plan.

## Triage of the 18 failures
| Group | Count | Cause | Result |
|---|---|---|---|
| `invitati.import.mobile.spec.ts:72` | 1 | my assertion had the old toast text; REV-58 changed it to "Annulla importazione rimuove le persone importate che non hai ancora modificato." | assertion updated, spec 5/5 green |
| `degraded` (7) and `email-off` (5) | 12 | environmental: these projects need their own `next start` servers (ports 3201/3202), which Playwright starts only when the project is selected (`--project=degraded` / `--project=email-off`) or with `E2E_ALL_SERVERS=1` (`playwright.config.ts`, `docs/technical/sviluppo-locale-e-test.md:84,103`). The verify run did not start them (`ERR_CONNECTION_REFUSED`). | run as intended: 12/12 passed |
| `webkit-smoke` (3) | 3 | WebKit browser not installed (`npm run e2e:install` not run; not installed by QA on instruction) | **not run** (see below) |
| `partner.spec.ts:415` mobile + desktop | 2 | environmental, **not from this branch**: the Supabase Auth container sends its default mail ("Reset your password", link `/auth/v1/verify?token=…`) instead of the repo template `supabase/templates/recovery.html` (`token_hash` link), so the test finds no `token_hash` link. `supabase/config.toml` and `supabase/templates/` are not changed by this branch (`git diff main`); the last change is FEAT-2026-001. The local stack was restarted (`npm run db:stop` / `db:start`, data kept) and the mail is still the default one, so the local Supabase CLI (v3.3.0) does not apply `[auth.email.template.recovery]` here. | still failing locally; owner: local Supabase CLI/stack setup. Check it on CI, where the same test normally runs. |

## What could not be run
- **webkit-smoke** (`cross-browser.spec.ts`, 3 tests): needs `npm run e2e:install`. Left to the CI / the developer.
- `partner.spec.ts:415` cannot pass on this machine until the CLI applies the recovery template (see above).

## Themes pass (T17)
`e2e/themes.spec.ts`, new test "12 themes x light/dark on /invitati": the page is seeded with visible coloured states and axe (WCAG 2.2 AA: contrast, target size) runs on four screens for each of the 12 themes in light and dark (96 axe runs, after animations settle): active filter chip, selection mode with the bar, the Tavoli tab with a table over capacity ("Oltre la capienza di 1"), the import preview with error cards, a warning and a new group. Result: no violation in any theme (3 of 3 runs green, about 1 minute each). While writing it the test hung in 2 of 3 runs: waiting for `document.getAnimations()` to reach 0 never ended because some animation loops forever; the wait now counts only finite animations (10 s cap). That was a bug in the test, fixed before commit.

## Findings during S1-S3 (all closed)
| ID | Severity | Evidence | Finding | Closed |
|---|---|---|---|---|
| QA-1 | note | `e2e/invitati.nav.spec.ts` | a `family` user is sent by the proxy to `/su-invito`, so the in-page panel of P5 is not reached; the brief (existing "su invito" screen, no Invitati item) is met. The test accepts both URLs. | ✅ accepted |
| QA-2 | should | `GuestRow.tsx` | axe `label-content-name-mismatch` on every row (name lacked the visible side text) | ✅ fixed in 2d228e0 |
| QA-3 | should | table sheet | the table sheet stayed open and covered the "Annulla" toast at 360 px | ✅ fixed in a0d626d |
| QA-4 | note | shared toast | contrast failure reported by axe during sonner's enter animation: false positive; the 12-theme toast check waits for the animations | ✅ |

## AC coverage
AC1 ✅ (`invitati.mobile` empty state, list, 320 px no scroll; `invitati.import` empty state "Importa")
AC2 ✅ (`invitati.mobile` "a person with every field": name required, phone/email rules, tel/email types)
AC3 ✅ ("Salva e aggiungi un altro")
AC4 ✅ (stored value A/B/both/null; options are the partner names)
AC5 ✅ (family, "Nuovo gruppo…", "Aggiungi persona", group summary)
AC6 ✅ (`invitati.desktop` guest conflict, both outcomes; `invitati.tavoli` table conflict)
AC7 ✅ (bulk assign/delete with Annulla at once; `acceptance/guests` undo with the real previous values)
AC8 ✅ (summary, "Per lato", "3 di 7" with sides on the total)
AC9 ✅ (search, filters sheet, chips, "Azzera filtri")
AC10 ✅ (person, group and table: Annulla, "Eliminati di recente", restore; members come back; the 8 s guarantee is the Vitest fake-timer test, not e2e)
AC11 ✅ (permanent delete and "Svuota" with confirmation and number; hard DELETE only on deleted rows via the API)
AC12 ✅ (`invitati.desktop` 1200 counted, search past the first thousand, "Mostra altre"; 500 list ready < 1 s measured in the page)
AC13 ✅ (`acceptance/guests`: audit and Novità without personal data, family/anon/stranger denied; the desktop spec checks the partner's Home)
AC14 ✅ (`invitati.tavoli` capacity, infants take no seat, one table per person)
AC15 ✅ (whole group: "Sposta" / "Lascia dove sono"; all seated; empty group)
AC16 ✅ (over capacity in text and summary; no table = only the empty tab, no field/filter/bulk action)
AC17 ✅ (`invitati.import` text and Windows-1252 file, preview cards)
AC18 ✅ (type, side, group reuse, errors, duplicate = warning)
AC19 ✅ (skipped rows listed and copied, "Torna indietro", close without saving, 500/501)
AC20 ✅ ("Annulla importazione" from the toast and from the result step)
AC21 ✅ (export with a filter on, "tutti" text, round trip into a second wedding, formula neutralised)
AC22 ✅ (`export.spec` and `invitati.desktop`: JSON with guests, groups, tables, deleted marked)
AC23 ✅ (`invitati.nav`: 6 items at 320 px, Guida card in Opzioni, "Aiuto" in each section, family without Invitati)
NFR: axe on every guests screen (list, sheets, tables, import steps) and 12 themes x light/dark.

## Flaky tests
None seen in the new specs (each run at least twice). `percorso.spec.ts:334` passed in the full run (known flaky, not triggered).

## Rerun after design-1 (a844366, 8f84e5a)
Fresh build, `E2E_PORT=3300`, only the affected specs: all `invitati*.spec.ts` (mobile and desktop), `export.spec.ts`, `guida.nav.spec.ts` and `themes.spec.ts` (including the guests themes test) pass. One assertion was updated, same intent: the "group already at this table" case now says "Nessuno aggiunto: sono rimasti dove erano." (was "Nessuno da aggiungere: sono già tutti seduti."). No product failure. The new row text, the alphabetical flat list and the new table-sheet order needed no change in the tests. Scale numbers unchanged (500 guests: list ready about 240-280 ms; search over 1200: 34 ms).

## Rerun after DES-03 (e770add)
Fresh build, `E2E_PORT=3300`, mobile and desktop: all `invitati*.spec.ts`, `themes.spec.ts`, `guida.nav.spec.ts`, `export.spec.ts`: 58 passed, 1 failed (REV-63 below). New desktop check in `invitati.desktop.spec.ts`: at 768 px, flat list with a table, 5 grid columns, the Nome cell is at least 7rem wide and rows are at most 80 px tall; at 1100 px no sideways scroll and axe clean, also in selection mode. 500 guests: list ready 349-371 ms; search over 1200: 33 ms. Note: with an extreme group name ("Famiglia Esempio Lunghissima", 28 characters) a row reaches 89 px at 768 px; the test uses realistic names.

**REV-63 (should, product):** at 390 px the visible separator is drawn WITHOUT spaces: "Bambino·Tony". The text is "Bambino · Tony" (innerText and accessible name are right), but the measured gap is 0 px before and 0 px after the dot: the spaces are whitespace text nodes between flex items (`flex flex-wrap` in `GuestRow.tsx`, `Sep`), which the browser does not render. Test: `invitati.mobile.spec.ts` "at 390 px the visible separator has spaces around it" fails on purpose until fixed (suggestion: horizontal padding/gap on the separator span instead of text spaces).

## Questions for the developer
1. WebKit smoke: run `npm run e2e:install` once, or leave it to CI?
2. `partner.spec.ts:415`: is the local Supabase CLI expected to apply `[auth.email.template.recovery]`? If CI passes it, only this machine's stack differs.
