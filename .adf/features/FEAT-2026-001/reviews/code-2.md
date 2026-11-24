# Code review 2 - T4 Motore del Percorso (FEAT-2026-001)

Verdict: **changes requested**. Counts: blocking 1, should 3, nit 5.
AC coverage: AC15, AC16/48, AC25, AC26, AC27, AC28, AC29, AC30, AC32, AC63 covered by tests and correct on read. AC24 (reference rule) has NO dedicated test (B1). Spec §5.1-5.7 examples are all present in the tests (5.7 reopen/needs_review is T8).
Verified correct: addMonths clamp, floor/modulo for negative months, months before weeks/days, negative offsets, integer UTC day counter with no host-TZ dependency, `todayInRome` via Intl (DST tests), purity (no `Date.now()`/`new Date()` outside `todayInRome(now)`, no I/O), AC28 eligibility, BR6 (deleted tasks count as "existing"), 30/31/90/91 thresholds, max-3 highlight overflow to Da recuperare.
Developer choices: rite enum OK (matches spec U10/T2); "nearest open" = earliest `dateFrom` OK (brief AC24 "caso peggiore"); `ADESSO_VISIBLE_ROWS = 5` OK per design §3.4 (see N1); null-date generated tasks to `hidden` OK in general, but see S1; dismissal `{templateKey, kind}` acceptable, see Q1.

## Blocking

B1. `src/domain/timeline/reference.ts` (no `reference.test.ts`) - the plan test row "Riferimento" (AC24, D28) assigns to T4 unit tests for: default = earliest open; period uses first day; manual reference; "torna automatico"; chosen = definitive; reopened (no chosen, manual kept) = same but provisional; manual scenario deleted/not open -> automatic; no scenarios -> null; tie-break on id. Only a single-scenario `ref()` helper in `home.test.ts` touches it. This is the function every due date depends on. Fix: add `reference.test.ts` covering each case above, including a past-dated open scenario (see Q2) and a `discarded`-only list -> null.

## Should

S1. `src/domain/timeline/group-tasks.ts:83` - `if (dateDependent && task.source === "template") hidden`. `due_date` is user-editable (plan §3 grants UPDATE `due_date`); if the couple clears the date of a generated dependent task, `dueOverridden` is true and `dueDate` null: the task vanishes from the Percorso with no way back (not deleted, not in Eliminati). AC15 hides only tasks that lack a date because there is no reference. Fix: hide only when `!task.dueOverridden`; otherwise treat it as dateless (Più avanti, "Senza scadenza"). Add a test next to "an overridden date keeps it visible". (If product wants clearing a date disallowed for generated tasks, say so and enforce it in T8; then document it here.)

S2. `src/domain/timeline/group-tasks.ts:25,81,105` - `hidden` mixes "deleted" with "no reference" tasks. T11 needs "Eliminati di recente" (restore) and must not show the dateless ones there; consumers would have to re-filter on `deleted`, duplicating the rule. Fix: split into `deleted` and `hidden` (or `noDate`) in `GroupedTasks`, and adjust the tests (`group-tasks.test.ts` "Fatti and deleted", the 39-hidden test).

S3. `src/domain/timeline/suggestions.ts:21-33` and `SuggestionDismissal` - dismissal is keyed only by `{templateKey, kind}` with no rite. Sequence: rite civile, "Ignora" the add of X; rite changes to simbolico then back to civile later: X is never offered again, even though the question was asked under a different rite. Probably acceptable for "never shown again" (AC16), but it is an unstated rule. Fix: either document it in the doc comment and in a test ("dismissal survives a rite round-trip"), or add `rite` to the dismissal (and to the T8 table). Please answer Q1; either way pin the behaviour with a test.

## Nit

N1. `group-tasks.ts:6` - `ADESSO_VISIBLE_ROWS` is exported but unused (the slicing is UI, T11). Fine as a shared constant, but add a one-line test or note so it does not drift (e.g. spec §5.1 Adesso has exactly 5 rows).
N2. `plain-date.ts:33,42` - `Date.UTC(year, ...)` maps years 0-99 to 1900-1999, and `isPlainDate` accepts `0050-01-01`. Cheap to harden: reject years < 1900 (or use `setUTCFullYear`). A malformed date from the DB also makes `groupTasks`/`nextSteps` throw `RangeError` for the whole list; decide whether bad rows should be skipped.
N3. `suggestions.ts:1-2` - two imports from the same module; merge.
N4. `suggestions.test.ts` "never re-suggests tasks the user deleted": `.filter(...).concat()` is a no-op and the removal of `documenti-pubblicazioni` is unrelated noise; simplify to the single deleted-task fixture.
N5. `group-tasks.test.ts` "Prossimi 3 mesi" asserts a Set plus only the minimum date; spec §5.1 gives dates 2026-12-25..2027-02-22 and priorities, so assert the exact ordered ids (by due, then priority: `scegli-testimoni`, `save-the-date`/`prenota-viaggio-nozze` per spec order, `apri-lista-nozze`) to lock the ordering rule. Also `home.test.ts` has no test for the location-only decision or for 1+2 truncation when more than 3 candidates exist beyond the first (only implicit).

## Questions for the developer

Q1. Should a dismissal be scoped to the rite (S3)?
Q2. `resolveReference` takes no `today`: an open scenario already in the past is still "nearest" (earliest) and becomes the reference, so every deadline derives from a past date. Is that intended (BR3 gives only a warning for early dates)? If yes, document it; if no, pass `today` and prefer the earliest non-past scenario.
Q3. Tests: confirm `npm run test:tz` (UTC and America/Los_Angeles) is green for these files; no test pins `process.env.TZ`, so the TZ claim rests on the CI script only.
