# Code review 15 - T15 Altro (round 1)

Commits: 8ffff11, 41702e8, 3785e27, da5261c. Verdict: **changes requested** (0 blocking, 2 should, 3 could, 2 questions).

## Declared deviations
- Export as a server action returning text: accepted. It runs with the user's session (RLS), stores nothing, and a wedding's data is small. The server action response has no 1 MB limit (that applies to request bodies). Documenting the deviation in plan §10 is enough.
- Theme last-write-wins: accepted (single value, column grant + `weddings_update`, id checked with `isApprovedThemeId` in the data layer and by regex in the action).
- `(app)/altro/loading.tsx`: accepted, in line with the other areas.
- Staged progress bar: accepted, with a note (C2).
- Info reads `last_heartbeat()`: accepted. The RPC checks `current_wedding_id()` and returns only a timestamp.

## Findings

### S1 (should) - `decision_events.actor_id` leaves in the JSON
`src/features/export/data.ts:114` selects `actor_id` and `buildExport` passes it through (`FORBIDDEN_KEYS` does not list it). It is an account user id (auth.users uuid): useless to the couple, and the review brief says no user ids. Fix: drop `actor_id` from the select, or map it to the partner slot ("A"/"B") like `assigneeLabel`. Add an assertion in `tests/integration/export.data.test.ts` that neither founder nor partner B ids appear in the output.

### S2 (should) - no test for AC59, Info, or the actions' entry guards
- `src/app/(app)/altro/promemoria/page.tsx:19-23`: AC59 (email off = switches hidden, explanation shown, nothing read from the DB) has no test at all. `data-testid="email-off-explanation"` is not referenced anywhere in tests or e2e. Add a component/page test with `readEmailConfig` mocked both ways.
- `src/features/{appearance,notifications,export}/actions.ts`: the glue (zod shape rejection, missing claims -> `forbidden`, `revalidatePath` only on success) is untested; T7a round 1 added glue tests for exactly this (`actions.test.ts`). Add the same here (mock `createClient`).
- `src/app/(app)/altro/info/page.tsx`: `describeCheck` ("oggi/ieri/data alle HH:MM", null -> "ancora nessuno") is pure logic with no test.

### C1 (could) - partner emails in the export
`wedding_partners.email` (data.ts:90) goes into the JSON. It is the partner's contact data, so I read it as allowed by AC42 ("impostazioni"). Question Q1 below.

### C2 (could) - staged progress is not real progress
`ExportPanel.tsx:49,57`: 15% / 70% are fixed values around one awaited call. Acceptable for AC42, but the text "Preparo il file…" is shown after the data is already ready. Keep it, but say so in a comment so nobody treats it as measured.

### C3 (could) - snapshot consistency of the paged read
`data.ts:86-167`: ten tables read in parallel, each paged, with no common snapshot. A write between pages could duplicate or skip a row. Negligible for two users; note it in the header comment, or leave it.

## Checked, no issue
- Confidentiality: explicit column lists; `invitations` never read; no `token_hash`; `sanitize` second layer; other wedding excluded by RLS (tested, including the pending-invitation token with a non-vacuous stored secret).
- CSV injection: handled by `neutralise` in `csv.ts` (T5), applied to every text cell of both CSVs.
- Notifications: own row only (`.eq("user_id", userId)` plus RLS, forged insert refused, tested); update-then-insert with 23505 retry is sound; the other switch is not touched.
- AC52 per user: tested for A and B. AC59: the page code is correct (flag read after `connection()`, no DB read when off). The only gap is the missing test (S2).
- AC49: theme in `weddings.theme_id`, both partners read it (tested); the cookie is written by `ThemeGallery.confirmSaved` after `ok`. Radiogroup, `aria-checked` and arrow keys are present.
- AC62: `SignOutButton` used, no service key anywhere in the four commits.
- Accessibility: switches have `Label htmlFor` + `aria-describedby`; the progress bar has an aria-label plus a text equivalent in an `aria-live="polite"` region; failures use `role="alert"`.
- Messages are fixed strings, never DB text.

## Questions for the developer
- Q1: is the partner's email in `wedding_partners` meant to be exported (AC42 "tutti i dati")? If yes, state it in plan §10; if no, remove it.
- Q2: should `exportedAt` and the file day both come from the same `getNow()` call? They do now; keep it that way.

## Response (developer, round 1)

| Finding | Response |
|---|---|
| S1 | Fixed. `actor_id` is no longer exported: each `decision_events` row gets `actor: { slot, name }` (or `null`), mapped from the partners' `user_id`, which is read only for the mapping and not exported. New test: the whole output (JSON + both CSVs) contains neither the founder's nor partner B's user id, nor `actor_id`, and an event shows `A` / `Tony`. |
| S2 | Fixed. AC59: `promemoria/page.test.tsx` (email off: explanation, no switches, no DB read; email on: switches, no explanation). Actions glue: `actions.test.ts` in each of `appearance`, `notifications`, `export` (zod rejection before session/DB, missing claims, `revalidatePath` only on success). `describeCheck` moved to `info/describe-check.ts` with `describe-check.test.ts` (today, yesterday, Rome day around midnight, long date, no heartbeat). |
| C1 / Q1 | Kept on purpose: AC42 asks for "impostazioni" and the export is the couple's own data. Stated in the header comment of `export/data.ts`; plan §10 to be updated by the coordinator. |
| C2 | Comment added in `ExportPanel.tsx`: the percentages are stage markers, not measured progress. |
| C3 | Accepted; noted in the header comment of `export/data.ts`. |
| Q2 | Yes, one `getNow()` call feeds both `exportedAt` and the file day; unchanged. |

## AC coverage
AC42 covered at data level (tests); AC44 Info shows the heartbeat (untested, S2); AC49 covered; AC52 covered; AC59 implemented, not tested (S2); AC62 implemented via `SignOutButton`.

## Round 2 (reviewer, commit 24e1e61)
`npx vitest run` on export, notifications, appearance and altro: 7 files, 22 tests passed. I did not run the new integration test for S1 (it needs the local stack); I read it.

- S1: closed. `actor_id` is mapped to `{slot, name}` and `partners` is rebuilt without `user_id`. The new test checks both user ids and `actor_id` are absent from all three files, and that an event shows A / Tony.
- S2: closed. AC59 page test, the glue tests in all three features, and `describeCheck` extracted with its own test.
- C1 / Q1: closed. Coordinator decision: partner emails stay, and plan §10 gets a note.
- C2, C3: closed (comments added).
- Q2: closed.

AC coverage after round 2: AC42, AC44, AC49, AC52, AC59, AC62 all covered.

Verdict: **approved**. 0 open findings.
