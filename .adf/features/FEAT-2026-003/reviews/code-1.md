# Code review 1 - T2 domain logic for guests (commit 8add42d)

Reviewer: adf:reviewer - 2026-11-25 - Verdict: **approved** (0 blocking, 1 should, 3 nit)

Scope: `src/domain/guests/*` (9 files). Only the plan files plus `normalize.ts` (see note N1).

## AC coverage
- AC2: name required/max 80, phone charset and 6-20, email regex, notes 500, category default adult: covered and tested at the edges (80/81, 5/6/20/21, 500/501).
- AC8 / BR1: infants in total, no seat concept here, "Senza lato" (`none`), deleted skipped, empty list: tested. "12 di 42 persone" tested (`peopleSummary`).
- AC9: AND filters, side/category/group/table, "Senza gruppo/tavolo" (also for deleted group/table), accent-insensitive search: tested.
- BR4: warning only (returns the list, never throws); accents/case/spaces, deleted and self excluded: tested.
- BR6: `bandOf` boundaries 0/50/51/80/81/120/121/1200 tested; names match the `core.sql` check (`up_to_50|50_80|80_120|over_120`).

## Developer notes
- Band edges (50 -> up_to_50): accepted. Consistent with the shared edges of the onboarding labels and with the example "62 -> 50-80". The rule is documented in `band.ts`.
- `normalize.ts` outside the owned list: accepted; it is needed by duplicates and filters and exported by `index.ts`. Add it to the plan T2 row when closing.
- `activeFilterCount` excludes the search box: accepted, consistent with design ("Filtri (n)" badge, search is in the toolbar); `hasActiveFilters` still includes it for "Azzera filtri".

## Findings

**REV-1 (should)** `validation.ts:3` - `LIMITS`, the regexes and the messages are the only copy of the rules, but T4 will write Zod schemas (`schemas.ts`) and T11 an import validator. Why: three copies of the AC2 rules drift. Fix: say in the plan/T4 that schemas must call `validateGuest`/`LIMITS` (or derive from them); add one test in T4 that the schema and `validateGuest` agree on the boundaries. Not a change to T2 itself.

**REV-2 (nit)** `normalize.ts:5` - the regex contains the raw combining characters (U+0300-U+036F) instead of escapes; invisible in review and easily lost by an editor. Fix: `/[̀-ͯ]/g`.

**REV-3 (nit)** `counts.ts:13-34` - `countGuests` and `countBySide` repeat the same loop. Fix: build `countBySide` and derive the total as the sum of the four buckets, or share an `addTo(counts, guest)` helper.

**REV-4 (nit)** `guests.test.ts` - small gaps: no test for `lastName: null` vs `""` as the same duplicate key, for `validateLastName` at 80/81, for `bandOf(NaN)`/negative (today NaN gives `over_120`; fine if the caller passes a real count, but say so). Fix: add 2-3 one-line cases.

## Risposte
- **REV-1**: rinviato a T4 come indicato dal coordinatore (schemi Zod derivati da `validateGuest`/`LIMITS` + test di concordanza).
- **REV-2**: fatto. `normalize.ts` ora costruisce il regex da una stringa con escape `\\u0300-\\u036f` (un editor non può più perdere i caratteri).
- **REV-3**: fatto. Helper `add(counts, guest)` condiviso da `countGuests` e `countBySide`.
- **REV-4**: fatto. Test per cognome null vs "", `validateLastName` 80/81, `bandOf(-1)`. NaN non gestito di proposito: documentato in `band.ts` (il chiamante passa un conteggio reale).

## Cross-check with the DB
`supabase/migrations/20261202100000_guests.sql` does not exist yet, so category `adult|child|infant` and side `A|B|both|null` were checked only against the plan and brief. Re-check names, length checks (80/500, phone 6-20 with the same charset) when developer A commits it.

## Security
No I/O, no secrets, no logging; pure functions. Regexes are linear (no catastrophic backtracking). Input type is `string | null` only; non-string values from `FormData` must be coerced by T4.
