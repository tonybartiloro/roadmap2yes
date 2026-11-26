# Code review 6 - FEAT-2026-003 / T5 (Persone UI at /invitati) + closure of code-4

Reviewer: adf:reviewer. Commit 7555fb6 (T5), plus 8f0d557 (code-4 fixes). Round 1, then round 2 (6adc63e, 2d228e0).

**Verdict round 1: changes requested** (0 blocking, 4 should, 4 nit). **Verdict round 2: approved** (all closed).

## code-4 closure (verified in 8f0d557)
- REV-17 closed: `bulkGuests` returns `partial` when the rollback fails or restores fewer rows (`data.ts:637-641`),
  `undo` returns `PARTIAL_UNDO` after a first batch, `partial` is in `STALE_CODES`, tests added. The UI reloads on it
  (`use-guest-actions.ts:36`) and shows the server text.
- REV-18 closed: `MAX_SELECTION` 5,000 with its own fixed text; the UI also disables the actions (`SelectionBar.tsx:57`).
  The Decision 10 note ("per selection, not per wedding") is in the brief (44e98b3).
- REV-19 closed (`unique` by id, `data.ts:190`). REV-20 closed (`versioned`: same version = `forbidden`).
- Question 2 answered (partial Svuota message). Question 1 (ADR-0002 line) written in 9c93cb9.

## Verified OK (no finding)
Privacy: no search term, filter or name in URLs (state only in React), no `console`, no storage, Ripristina/Elimina
definitivamente send only kind/id/version; names appear only in local toasts/labels. Themes: no hard-coded colours
(grep). A11y basics are in place: 44 px rows/buttons, `role="search"` with label, `aria-expanded/controls` on groups,
`Seleziona {nome}`, `role="status"` count, AlertDialog with Annulla first, Annulla toast >= 8 s, chips with
"Rimuovi filtro", fixed texts for every failure. Route files match the other sections (`error.tsx` with `reset`, same
as 8 existing boundaries; `loading.tsx`; "su invito" in page; `not_migrated` card). `useConflict` from budget: already
imported by settings, so a precedent; moving it to a shared place is a later clean-up, no action here.
Extension points exist: `menuActions`, `emptyExtra` (screen), `extra` (row, Summary), `extraActions` (SelectionBar).

## Findings (status after round 2)

**REV-24 (should) CLOSED** - selection bar and FAB cover the end of the list (layout `pb-28`, bar up to ~8 rem at 320 px).
Fix verified: wrapper `pb-44` while selecting, `pb-12` otherwise. The 320 px check stays with the QA e2e.

**REV-25 (should) CLOSED** - the selection outlived the filter, so "Elimina" could act on hidden people. Fix verified:
`setFilters` clears the selection; test added (select all, type in search, "0 selezionati", Elimina disabled).

**REV-26 (should) CLOSED** - assign to "Nuovo gruppo" then retry created a second group. Fix verified: after
`resolveGroup` the choice becomes `existing`; test asserts one `addGroupAction` call.

**REV-27 (should) CLOSED** - re-render cost at 1200 rows. Fix verified: `memo(GuestRow)`, stable `useCallback`
`onSelect(id, on)`/`onOpen(guest)`, `useDeferredValue` on the query, `buildSections` linear (push + `Set`), `groupNames` via
`Map`. Not measured in the browser (QA desktop e2e).

**REV-28 (nit) CLOSED** `LIMITS.name` in GroupPicker and RenameGroupSheet. **REV-29 (nit) CLOSED** `SectionDef` type, no
`as never`; non-paged lists noted in code. **REV-30 (nit) CLOSED** focus goes to "Altro" (`id` on the trigger), count
follows the deferred query. **REV-31 (nit) CLOSED** `plural` in the undo toast, "tutti i N" without filters, tests for
`forbidden` and assign-from-bar.

## Round 2: 2d228e0 (QA a11y fix on guest rows) - accepted
The row button has no `aria-label`; its name is its visible text plus an sr-only "Adulto" (WCAG 2.5.3, label in name).
The group still shows in the flat list and the side is now part of the name: fine. Remark, not blocking: the focus sent
by `stopSelecting` may race with Radix restoring focus when the assign sheet closes; QA e2e will show it.

## Risposte (developer B)
- REV-24: `pb-44` in selezione, `pb-12` altrimenti; non misurato a 320 px, lo verifica l'e2e di QA.
- REV-25: `setFilters` svuota la selezione. Test incluso.
- REV-26: la scelta diventa `existing` dopo la creazione. Test incluso.
- REV-27: `memo`, callback stabili, `useDeferredValue`, `buildSections` lineare, `groupNames` con `Map`. Non misurato con 1200 righe nel browser.
- REV-28..31: fatti (`LIMITS.name`, `SectionDef`, focus su "Altro", `plural` e etichetta "filtrati" solo con filtri, test `forbidden` e assegna-da-barra).

## AC coverage
AC1 empty state ok; AC2/AC3/AC4 sheet, validation, duplicate warning ok; AC5 family and groups ok; AC6 conflict dialog
tested; AC7 multi-select, Annulla, partial/too-large handled; AC8 summary ok; AC9 filters and chips ok; AC10 recently
deleted ok; AC12 collapse above 100 and "Mostra altre" ok; AC23 "su invito" in page, covered by QA e2e
(`e2e/invitati.nav.spec.ts`; the family role is redirected by the proxy to /su-invito, accepted as QA-1). T9/T13 hooks present.

## Questions for the developer
None open.
