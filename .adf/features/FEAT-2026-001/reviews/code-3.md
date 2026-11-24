# Code review 3 - T5 Puri (round 1)

Commit: bee42d9. Verdict: **changes requested** (0 blocking, 3 should, 4 nits, 3 questions).
AC coverage: AC33-AC38 (money, totals, warnings, bars), AC41 (news), AC42 (export), AC46 (display name), BR20/D49 (access code) are all implemented. AC42 CSV rule on the date-scenario location agreed with the coordinator (JSON only). Money parsing, aggregation, CSV injection, generator randomness and news filtering checked and sound, except as below.

## Should

1. `src/domain/export/build.ts` (budgetCsv, `assigned` rows) - the "(assegnato)" rows put the Assegnato amount in the 7th column, headed "Ancora da pagare". In Excel a reader sees "Catering; (assegnato) ... 10000,00" under "Ancora da pagare": wrong data under a header (contract). Fix: add an "Assegnato" column (item rows empty) or put the amount in a column that does not clash; update `export.test.ts:179-183`.
2. `src/domain/export/build.ts` (budgetCsv, `paid`) - the CSV sums paid payments for every item regardless of status, while `itemPaidCents` (totals) counts only agreed items. A planned/cancelled item with a paid payment shows Pagato > 0 in the CSV and 0 in the app: two sources of truth for the same number (and `totals` is computed just above but not reused). Fix: use `itemPaidCents(item, input.payments)` and `itemAgreedCents`; add a test with a planned item that has a paid payment. Same for categories of deleted rows: `categoryName` includes deleted categories while `totals` excludes them; filter on `!c.deleted` for consistency.
3. `src/domain/news/build.ts` - a reference change produces two lines: the audit row (`weddings.applied_reference_date`: "ha cambiato il riferimento ...") and the decision event `reference_set`/`reference_auto` ("ha impostato un riferimento ..."). The home would show the same action twice. No test covers the overlap. Fix: pick one source (audit has the date, so drop `reference_set`/`reference_auto` from `decisionEventText`, or drop the audit case) and add a test with both rows present.

## Nits

4. `src/domain/budget/bars.ts:22` - `overflow: agreed > 0` when Assegnato is null/0, while `budgetWarnings` deliberately gives no over-warning in that case. The bar would look "over" with no explanatory message. Align (overflow false when nothing is assigned; the text already says "Nessun importo assegnato").
5. `src/lib/access-code.ts` (personal check) - `folded.includes(f)` is not separator-insensitive: with email `tony.rossi@...` the code `tony-rossi-4821` passes (fragments are "tony.rossi" and "tonyrossi"). Also compare against `folded.replace(/[^\p{L}\p{N}]/gu, "")`. Cheap, closes the obvious bypass. Also `ACCESS_CODE_ERRORS["too-long"]` says "72 caratteri" while the check is on bytes (a code of 40 emoji/accented chars fails); acceptable, but say "72 byte" or document it in the message tests.
6. `src/lib/access-code.ts` (`generateAccessCode`) - with an injected `random` that never yields usable bytes (all >= 248, or a constant without letter/digit) the `for(;;)` / `while` loops never end. Production uses Web Crypto so it is safe; add an iteration cap (throw) so a bad test double cannot hang CI. Optional: the generated code is not run through `validateAccessCode` (a 3-letter name fragment can appear by chance, ~1e-4); the caller (T7a) should validate and regenerate - note it in the doc comment.
7. `src/lib/money.ts` - `toCents` counts leading zeros toward the 13-digit guard ("00000000000001" is "too-large"); `".50"`/",50" are "invalid" (acceptable, but D40 does not say: confirm intended); "1.5000" returns "invalid" rather than "too-many-decimals". Harmless, none affects exactness. `csv.ts` doc comment on `toCsv` ("Cells that are pre-formatted amounts...") is attached to the wrong function and a negative amount string "-1,50" would receive the apostrophe: unreachable today (DB rejects negatives), but add a one-line test or comment.

## Verified OK

- Money: string to integer cents, no float; `Number(integer) * 100` is safe (<= 13 digits < 2^53); D40 cases, "1,234.56", "1.500", "12,345" error, cap exactly 1e9 euro accepted and +0,01 rejected, negatives incl. "−", ASCII-only `\d`.
- Aggregation: integer sums; Ancora da pagare = max(0, Concordato - Pagato) per scope and summed per category; deleted items/payments/categories excluded; latest version with deterministic tie-break.
- CSV: BOM, `;`, CRLF, quoting, `= + - @ TAB CR` neutralised before quoting. JSON: deep `sanitize` of token/code/birth keys; `now` injected, no `Date.now`/I/O in the pure modules.
- Generator: Web Crypto, rejection sampling (limit 248 of 256), letters and digits enforced, alphabet without ambiguous chars; test covers bias.
- News: audit through a whitelist that reads only named fields (no token hash reachable), viewer's own actions dropped, deterministic sort, `since === null` gives none.

## Questions for the developer

- Q1: is the duplicated "reference" news line (should 3) intended because the two sources can arrive independently? If so how do you dedupe?
- Q2: ",50" and ".50" rejected: intended?
- Q3: system actions (`actorId === null`) in audit/account events are shown to everyone: intended (e.g. cron-created rows)? 

Developer choices evaluated: names/email parts < 3 chars ignored (ok), 72 limit in bytes (ok, see nit 5), agreed without amount counts 0 (ok, documented), Ancora da pagare clamp (ok), no over-warning when Assegnato null (ok, align bar), news phrasing and audit whitelist (ok), error text without final period (matches AC38 literal; fine).
