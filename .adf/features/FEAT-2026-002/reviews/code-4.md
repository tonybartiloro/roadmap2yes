# FEAT-2026-002 — code review, round 4

Verdict: approved (REV-11 and REV-12 closed after commit 271f1d5; no blocking)
Scope reviewed: commits 565d775 and 271f1d5: `FocusHeading.tsx` (+ `GuideShell`), `guida/layout.tsx`, tests, guide `not-found.tsx`, `source.ts`

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-11 | should | `FocusHeading.tsx` (565d775) | Focus rule depended on a one-tick global flag cleared by `setTimeout 0`; a page streaming in after the skeleton (`guida/loading.tsx`) would miss it. The `changed` branch was dead. | A focus rule decided by timing is flaky; a11y behaviour must be deterministic. | Guide layout tracking the visit, no global or timer. | Fixed in 271f1d5: `GuideShell` keeps the first path of the visit; `FocusHeading` focuses once the path differs. Developer found that my exact proposal (effect-order ref) focused on hard load when the page streams late, and chose path comparison instead. | ✅ closed by reviewer |
| REV-12 | note | `not-found.tsx:7-9` | H1 on not-found is right (one H1, AC6). Heading styles copied in 4 places. | Minor duplication. | Accept. | Accepted. | ✅ |

## Closure of REV-11 (reviewer, after 271f1d5)
- The developer's variant is better than my proposal: my version assumed the page mounts before the layout's effect; with Suspense streaming on a hard load it does not. Comparing the current path with the path the layout first rendered with is independent of mount timing.
- Checked: layout mounts anew when arriving from another section, so its start path is the arrival page (no focus); persists across `/guida`, `/guida/x`, `/guida/y`; back/forward and return to the start path focus (`navigated` latches); Strict Mode safe (the state initialiser and `||=` are idempotent for equal paths). The `useState` initialiser captures `pathname` once, as intended.
- Tests cover first load, Strict Mode plus late stream, skeleton, back to start, new shell; e2e covers index to page and arrival from `/altro`; 34/34 on a production build per the developer.
- Residual (not a finding): a hard load on `/guida/x` and then a click back to `/guida/x` via another page focuses, which is correct (a navigation).

## turbopackIgnore check
`.next/server/app/(app)/guida/[...pagina]/page.js.nft.json` still lists `docs/functional/budget.md` (grep count 1). The docs are shipped by `outputFileTracingIncludes`; the hint only removes the whole-project tracing. OK.

## AC coverage
AC6 (single H1 incl. not-found): met. Focus-on-navigation rule: met, deterministic.

## Questions for the developer
None.
