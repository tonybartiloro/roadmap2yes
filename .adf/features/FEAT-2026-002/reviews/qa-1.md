# FEAT-2026-002 — qa review, round 1

Verdict: approved (with QA-2 and QA-3 as notes)
Scope reviewed: branch `feature/FEAT-2026-002-guida-in-app` up to 58ce733, S1+S2, e2e T9/T10 and the full e2e plan once.

## Results
- Integrated run: fresh `npm run build`, `E2E_PORT=3300 E2E_ALL_SERVERS=1 npm run e2e` (all 6 projects), 264 tests: **259 passed, 1 skipped (existing), 4 failed**.
- The 4 failures: 3 `webkit-smoke` (WebKit not installed, environment, QA-2); 1 `percorso.spec.ts:334` (flaky under load, QA-3; passes 3/3 alone).
- Earlier targeted runs (mobile and desktop): guida, login, cache, a11y, themes 115/115; guida.nav and altro 10/10 per project; guida.spec 16/16 after S2.

## Triage of the failed `adf verify --with-e2e` run (default port)
Cause: environment. Port 3000 on this machine is a different Docker app (`curl 127.0.0.1:3000/accesso` answers `307 -> /accedi`, not this app's login), and `reuseExistingServer` makes Playwright use it. Hence the 20 ms `/altro/esporta` redirect failure (the foreign app redirects to `/accedi`, the test expects `/accesso`), the 1.0 m timeouts and the "did not run". No test assertion changed for `/altro/esporta`: `git diff origin/main -- e2e/login.spec.ts` only adds the three `/guida` routes and a test; the route list keeps `/altro/...` (URL unchanged by Q8). The same specs pass on port 3300.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| QA-1 | should | `curl http://127.0.0.1:3000/accesso` -> 307 `/accedi`; `.adf/state/logs/e2e.log` | `adf verify --with-e2e` ran against a foreign server on 3000 and reported 33 min of false failures | A false red hides real ones and wastes time | Run verify with `E2E_PORT=3300` (or any free port; Playwright reads `E2E_PORT`) or free port 3000; document `E2E_PORT` in `.adf/project.md` commands (e.g. `e2e: "npm run e2e"`, note: set `E2E_PORT` if 3000 is taken). Nothing to fix in app code | | |
| QA-2 | note | `webkit-smoke` x3, "Executable doesn't exist ... webkit-2388" | WebKit is not installed locally, so `cross-browser.spec.ts` did not run | AC-independent smoke on WebKit unproved here | `npm run e2e:install` (downloads browsers: needs the developer's OK) or rely on CI `e2e-full` | | |
| QA-3 | note | `percorso.spec.ts:334` failed once at 11.8 s (9 workers), passed 3/3 alone in 3 s; `git diff origin/main` touches nothing in Percorso | Flaky under load: a deleted generated task row still present after reload. Not caused by this branch | A flaky test is a bug | Not in this feature; file as a separate chore (suspect the 8 s "Annulla" window versus the reload) | | |

## AC coverage
- AC1 ✅ `guida.spec` (index in README order, 6 items, "Guida" last and `aria-current` on /guida, /guida/budget, /guida/xyz), `interactive.test.tsx` (developer unit)
- AC2 ✅ `guida.spec` 320 px (no overflow, Tab to table region, `th scope`, underline), `a11y.spec` (axe + reflow 320/640 on 3 guide pages), `themes.spec` (12 themes x light/dark axe on 3 guide pages). Gap: no current doc has a table wide enough to scroll at 320 px, so "ArrowRight -> scrollLeft > 0" runs conditionally (covered by focusability only)
- AC3 ✅ `guida.spec` (internal link, H1 focus, no focus on first load, back; no "Storico"/"docs/technical" on all 12 pages); unit `guide-docs.test.tsx` for the CI guard
- AC4 ✅ `guida.spec` index = README rows; unit `source.test.ts` (checkIndex, files vs table)
- AC5 ✅ `login.spec` (3 guide routes -> 3xx `/accesso`, no guide text), `cache.spec` (no-store/noindex), `guida.spec` (7 invalid paths -> "Pagina non trovata" + "Torna alla Guida")
- AC6 ✅ `guida.spec` (titles, one H1 and no level skips on 13 pages, targets >= 44 px), `a11y.spec`
- AC7 ✅ `guida.nav.spec` (36 theme x width combos, labels fit; proof that "Impostazioni" would fail), `altro.spec` (constant on H1/title/nav, `aria-current`, no "Altro" item, "Torna a Opzioni"). The email and onboarding wording is covered by developer unit tests (`templates.test.ts`)

## Questions for the developer
- OK to run `npm run e2e:install` to include WebKit locally, or leave it to CI?
