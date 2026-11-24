# FEAT-2026-001 — code review, round 1 (T11 Percorso UI)

Verdict: changes requested
Scope reviewed: commits 1d57c9f (data layer) and dbf1c82 (UI): `src/app/(app)/percorso/**`, `src/features/timeline/**`, `tests/integration/timeline.percorso.test.ts`. `npm run typecheck` and `npm run lint` are clean; `vitest run src/features/timeline` has 56 tests passing (the integration suite was not run).

Security: the server actions use zod plus the user session (`createClient`), with no service key anywhere. `wedding_id` is read server-side from RLS (`weddingIdOf`), and the client never sends it. `?anteprima` is capped at 64 characters and only matched against the user's own candidate scenarios, so an unknown id gives a notice and writes nothing. `buildPercorsoView` is pure and takes `today` as input. The TS reference rule matches `private.resolve_reference` in the DB, and there is an integration test for it. No blocking security issue.

| ID | Severity | Evidence | Finding | Why it matters | Proposal | Response (author) | Closed |
|---|---|---|---|---|---|---|---|
| REV-1 | should | `src/features/timeline/copy.ts:11`, `TaskSheet.tsx:141-146`, `PercorsoScreen.test.tsx:359` | The bureaucratic disclaimer is a local string ("verifica sempre") that duplicates `BUREAUCRATIC_DISCLAIMER` in `src/content/milestones/index.ts:9` ("verificate sempre"). Brief AC25 and the catalogue use "verificate". | There must be one source of truth. The UI contradicts AC25, and the test pins the wrong wording. | Delete `COPY.bureaucratic`, import `BUREAUCRATIC_DISCLAIMER` in `TaskSheet`, and fix the test and the comment in `copy.ts:10`. Keep a "." only if the catalogue has one. | Fixed: `COPY.bureaucratic` deleted; `TaskSheet` and the test import `BUREAUCRATIC_DISCLAIMER` (AC25 wording is authoritative). | ✅ |
| REV-2 | should | `PercorsoScreen.tsx:156-174`, `TaskGroup.tsx:105-120`, `TaskRow.tsx:55-60`; design §3.8 line 117 | In preview the checkboxes, "+", sheet edit/delete and the suggestion buttons all still trigger writes. Design §3.8 says "nessuna richiesta di scrittura parte durante l'anteprima", and AC32 says "senza salvare nulla". `preview` is passed to `TaskRow` but only changes the style. A tick in preview also regroups rows using preview dates, which is confusing. | AC32 and the design checklist ("nessuna scrittura (rete)") are broken in the strict reading. The only tested guarantee is that the pure view does not write. | In preview, disable the checkboxes (or ignore `onToggle`) and the "+" button, and hide the other mutation entry points. Alternatively, record a decision to allow task writes in preview and update the design. Add a component test that clicking a checkbox in preview calls no action. | Fixed (coordinator decision: no writes in preview): checkboxes disabled; "+", suggestions, "Eliminati di recente" and "Va bene così per tutti" hidden; the task sheet is read-only (edit/delete/acknowledge hidden). Test asserts no action is called. | ✅ |
| REV-3 | should | `PercorsoScreen.tsx:167-171, 183-187, 262-266, 297-300` | None of the "Annulla" callbacks check the result: undo of complete, delete and remove, and undo of the reference. If `restoreTaskAction` or `setTaskStatusAction` fails (conflict, network, the partner changed it), nothing is shown. For the delete case the optimistic restore reverts and the task silently reappears as deleted. | AC31 promises the undo works. A silent failure is a trust issue and violates "optimistic updates roll back on error with a message". The reference undo does show an error, so the pattern exists. | Handle `!result.ok` in each undo with `toast.error(result.message)`. For conflicts, open the dialog or reload via `router.refresh()`. Add a test with a rejected undo. | Fixed: every "Annulla" goes through `undoWrite`, which shows `toast.error` (a dedicated message on conflict) and calls `router.refresh()`. Test with a rejected undo added. | ✅ |
| REV-4 | note | `actions.ts:176` | `deleted_at` is set with the app server's `new Date()` instead of DB `now()` or the injected clock. | Project rule: injectable clock, and the DB is the single time source for stored timestamps. It only affects the ordering of "Eliminati di recente", and the clock skew is negligible. | Set it in a column default or trigger, or use `getNow()`. Not blocking. | Fixed: `getNow()` (the DB trigger stamps the stored value anyway). | ✅ |
| REV-5 | note | `PercorsoScreen.tsx:147-148` | `write()` also calls `setSheetError` for checkbox failures that did not come from the sheet. The error then appears in the next sheet that opens. | State leak, cosmetic. | Clear `sheetError` in `onClose` (already done) and on open, or only set it from `save()`. | Fixed: `write()` sets the sheet error only when called from `save()`; test added. | ✅ |

Declared deviations (my evaluation):
1. Integration test path `tests/integration/*.test.ts` is covered by the `integration` project in vitest, so it is fine.
2. The default filter "Tutti" instead of "Miei" is accepted. AC30 does not force "Miei", and showing everything is the safer default. Please align design §3.4 at the next design pass.
3. The native category select is accepted: it is accessible, has a 44 px target and works on mobile.
4. No banner fade or scroll-padding is accepted, because `globals.css` is not in the T11 scope. Add `scroll-padding-top` for the sticky banner to the polish task (design a11y line 729); keyboard focus can be hidden under `sticky top-0` meanwhile.
5. The disclaimer is REV-1.
6. `/scelte/date` resolves to `src/app/(app)/scelte/[key]/page.tsx`, so it is fine.
7. No conflict dialog for set-reference is accepted: the RPC has no version, and the DB errors `decision_taken` and `invalid_option` are mapped to messages.

Checked and OK:
- **Grouping:** thresholds are 0..30, 31..90 and beyond (T4's `groupTasks`), and the max-3 highlight is enforced there.
- **"Da recuperare":** neutral tone (`recoverTone`), collapsed above 5 rows.
- **Undo toast:** 10 s (`UNDO_TOAST_MS`, at least 8 s) and "Eliminati di recente" restorable.
- **Suggestions:** `diffSuggestions` counts deleted tasks as existing and honours the dismissals, so deleted or dismissed items are not re-suggested. Accepting goes through `insert_template_tasks` with catalogue data only.
- **Recalculation:** done by the DB (`sync_timeline_for`: todo, not overridden, not deleted).
- **Optimistic updates:** `useOptimistic` inside `startTransition`, so they roll back on failure.
- **Conflicts:** `versionedUpdate`, `ConflictDialog` and "Salva comunque" retry with the current version.
- **Sheet and editing:** the task sheet opens from the raw `tasks`, not the preview dates, so editing in preview cannot persist a preview date.
- **Accessibility:** buttons are `h-11`, groups use `aria-expanded` and `aria-controls`, the `aria-live` region is present, and nothing is swipe-only.
- **Next 16:** dynamic server page, no `use cache`, client boundary at `PercorsoScreen`, `revalidatePath` in the actions.

## AC coverage
AC15 ✅ (view.test, hidden note) · AC16 ✅ (integration suggestions) · AC20 ✅ (integration reopen, banner) · AC24 ✅ (TS equals DB test) · AC25 ⚠️ (REV-1, wording) · AC29 ✅ · AC30 ✅ (filters, tests) · AC31 ✅ with REV-3 · AC32 ⚠️ (REV-2) · AC40 ✅ (integration conflict, ConflictDialog tests)

## Questions for the developer
- Is writing task state in preview intentional (REV-2)? If so, update the design.
- Was 360 px checked visually? The banner has "Esci", "Imposta come riferimento" and "Altro" on one wrapping row, and I could not verify it without a browser.
